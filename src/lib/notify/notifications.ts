// 結果連絡メール(申込受付・当選・落選・繰上・キャンセル受付)の記録と送信キュー。
// 会員がこのシステムを見に来なくても結果に気づけるよう、連絡はすべてメールで送る
// (2026-09-05 顧客判断)。
//
// 無料枠対応(2026-09-05 顧客要望: 1日200通以上を無料で):
// - Resend(予算90通/日) + Brevo(予算290通/日)を併用し、予算の残っている
//   プロバイダで送る(channel.ts)。合計380通/日まで無料で送れる
// - 記録はビジネス処理(申込・選定・繰上・キャンセル)と同一トランザクションで
//   'pending'(送信待ち)として行い、送信はコミット後にキュー処理で行う
// - 優先度: 申込受付・繰上当選・キャンセル受付(少量・緊急) → 当選 →
//   落選連絡(待機。繰上の可能性が低い「待機番号が後ろの人」から送る) → 落選(名簿外)
//   ※待機の前の方は繰上の可能性が高いため送信を後回しにする。落選連絡の送信前に
//     繰り上がった場合は落選連絡を取りやめ、当選連絡だけが届く(cancel.ts)
// - 予算超過分は Vercel Cron(/api/notify/process)が翌日以降に自動送信。
//   管理画面の「送信待ちをいま送信する」でも手動で流せる
// - 毎秒のレート制限(Resend: 2req/s)のため、送信間隔を約0.6秒あける
import type { PoolClient } from "pg";
import QRCode from "qrcode";
import { query } from "@/lib/db";
import { getNotifyProviders } from "@/lib/notify/channel";

export type NotificationKind =
  | "apply_ack"
  | "selection_won"
  | "promotion_won"
  | "waitlist_info"
  | "selection_lost"
  | "cancel_ack";

export const KIND_LABELS: Record<string, string> = {
  apply_ack: "申込受付",
  selection_won: "当選",
  promotion_won: "繰上当選",
  waitlist_info: "落選連絡(繰上待ち)",
  selection_lost: "落選連絡(名簿外)",
  cancel_ack: "キャンセル受付",
};

/** 各処理のトランザクション内で呼ぶ: 送信待ちの通知を記録する */
export async function recordNotification(
  client: PoolClient,
  input: {
    applicationId: string;
    eventId: string;
    kind: NotificationKind;
    email: string;
    subject: string;
    body: string;
  }
): Promise<string> {
  const res = await client.query(
    `insert into notifications (application_id, event_id, kind, email, subject, body, status)
     values ($1, $2, $3, $4, $5, $6, 'pending') returning id`,
    [input.applicationId, input.eventId, input.kind, input.email, input.subject, input.body]
  );
  return res.rows[0].id as string;
}

// 優先度: 少量・緊急のもの(申込受付・繰上・キャンセル受付)を先に、
// 次に当選(QR付き)、落選連絡(待機)、最後に落選(名簿外)
const PRIORITY_SQL = `case n.kind
  when 'apply_ack' then 0 when 'promotion_won' then 0 when 'cancel_ack' then 0
  when 'selection_won' then 1 when 'waitlist_info' then 2 else 3 end`;

export type QueueResult = { sent: number; failed: number; remaining: number };

/** 送信待ちの件数(管理画面の表示用) */
export async function countPendingNotifications(): Promise<number> {
  const rows = await query<{ c: number }>(
    "select count(*)::int as c from notifications where status = 'pending'"
  );
  return rows[0].c;
}

/**
 * 送信キューの処理。プロバイダごとの1日予算の残りの範囲で、優先度順に送信する。
 * 予算内なら当日中に送り切る方針(2026-09-05 顧客要望)で、管理画面が
 * このAPIを繰り返し呼んで自動で流し切る。予算を使い切ったときだけ翌日へ持ち越す。
 * - maxSends: 今回の処理量の上限(サーバーの実行時間制限内に収める)
 * - timeBudgetMs: 経過時間の上限。超えたら残りを次回に回す
 * 多重実行対策: 送信前に status を pending → sent へ原子的に更新して行を
 * 確保する(確保できなければ他の処理が担当中)。二重送信は起きない
 */
export async function processNotificationQueue(opts?: {
  maxSends?: number;
  timeBudgetMs?: number;
}): Promise<QueueResult> {
  const startedAt = Date.now();
  // プロバイダごとの本日送信数(Resend/Brevo の無料枠リセットに合わせて UTC の日付)。
  // provider 未記録の旧データは先頭プロバイダの消費として数える
  const providers = getNotifyProviders();
  const sentRows = await query<{ provider: string | null; c: number }>(
    `select provider, count(*)::int as c from notifications
     where sent_at >= date_trunc('day', now()) group by provider`
  );
  const sentBy = new Map<string, number>();
  for (const r of sentRows) sentBy.set(r.provider ?? providers[0].name, (sentBy.get(r.provider ?? providers[0].name) ?? 0) + r.c);
  const budgets = providers.map((p) => ({
    ...p,
    remaining: Math.max(0, p.dailyLimit - (sentBy.get(p.name) ?? 0)),
  }));
  let budget = budgets.reduce((sum, p) => sum + p.remaining, 0);
  if (opts?.maxSends != null) budget = Math.min(budget, opts.maxSends);

  let sent = 0;
  let failed = 0;
  if (budget > 0) {
    const rows = await query<{
      id: string;
      kind: string;
      email: string;
      subject: string;
      body: string;
      app_status: string | null;
      ticket_token: string | null;
    }>(
      // 落選連絡(待機)は待機番号の大きい(=繰上の可能性が低い)人から送る
      `select n.id, n.kind, n.email, n.subject, n.body,
              a.status as app_status, t.token as ticket_token
       from notifications n
       left join applications a on a.id = n.application_id
       left join tickets t on t.application_id = a.id and t.revoked_at is null
       where n.status = 'pending'
       order by ${PRIORITY_SQL},
                (case when n.kind = 'waitlist_info' then coalesce(a.waitlist_order, 0) end) desc nulls last,
                n.created_at asc
       limit $1`,
      [budget]
    );

    for (const n of rows) {
      if (opts?.timeBudgetMs != null && Date.now() - startedAt > opts.timeBudgetMs) {
        break; // 実行時間の上限。残りは次の呼び出しが引き継ぐ
      }
      const needQr = n.kind === "selection_won" || n.kind === "promotion_won";
      // 送信中止の判定・行の確保はすべて「status='pending' の場合だけ更新」で行い、
      // 並行して動く別の処理と同じ行を二重に扱わないようにする
      if (needQr && (n.app_status !== "won" || !n.ticket_token)) {
        // 送信前にキャンセルされた等。当選メールは送らず失敗として記録する
        const r = await query<{ id: string }>(
          `update notifications set status = 'failed', error = $2
           where id = $1 and status = 'pending' returning id`,
          [n.id, "当選が取り消されたため送信を中止しました"]
        );
        if (r[0]) failed++;
        continue;
      }
      if (n.kind === "waitlist_info" && n.app_status !== "waitlisted") {
        // 送信前に繰上当選・キャンセルされた等。落選連絡は送らない
        // (繰上時は cancel.ts が pending を消すので、これは競合時の保険)
        const r = await query<{ id: string }>(
          `update notifications set status = 'failed', error = $2
           where id = $1 and status = 'pending' returning id`,
          [n.id, "状態が変わったため送信を中止しました(繰上当選またはキャンセル)"]
        );
        if (r[0]) failed++;
        continue;
      }
      const provider = budgets.find((p) => p.remaining > 0);
      if (!provider) break; // 全プロバイダの本日予算を使い切った
      // 行を確保(先に sent にしてから送る)。送信失敗時は failed に戻す。
      // 送信後にマークする方式だと、並行実行時に同じメールが二重送信されうる
      const claimed = await query<{ id: string }>(
        `update notifications set status = 'sent', sent_at = now(), provider = $2
         where id = $1 and status = 'pending' returning id`,
        [n.id, provider.name]
      );
      if (!claimed[0]) continue; // 別の処理が担当済み
      try {
        // 毎秒のレート制限(Resend: 2req/s)を守るため送信間隔をあける
        if (sent + failed > 0) await new Promise((r) => setTimeout(r, 600));
        const attachments = needQr
          ? [
              {
                filename: "入場QRコード.png",
                content: await QRCode.toBuffer(n.ticket_token!, {
                  width: 520,
                  margin: 1,
                }),
              },
            ]
          : undefined;
        await provider.channel.send({
          to: n.email,
          subject: n.subject,
          body: n.body,
          attachments,
        });
        provider.remaining--;
        sent++;
      } catch (e) {
        await query(
          `update notifications set status = 'failed', sent_at = null, provider = null,
                  error = $2 where id = $1`,
          [n.id, e instanceof Error ? e.message : String(e)]
        );
        failed++;
      }
    }
  }

  const remaining = await countPendingNotifications();
  return { sent, failed, remaining };
}
