// 結果連絡メール(当選・待機・落選・繰上・キャンセル受付)の記録と送信キュー。
// 会員がこのシステムを見に来なくても結果に気づけるよう、連絡はすべてメールで送る
// (2026-09-05 顧客判断)。
//
// 無料枠対応(2026-09-05 顧客要望: 応募300人の全員連絡を無料で):
// Resend の無料枠は 1日100通・月3,000通・毎秒2リクエスト。そこで、
// - 記録はビジネス処理(選定・繰上・キャンセル)と同一トランザクションで
//   'pending'(送信待ち)として行い、送信はコミット後にキュー処理で行う
// - キュー処理は「1日の送信予算(NOTIFY_DAILY_LIMIT, 既定90通)」の範囲で
//   優先度順(繰上・キャンセル受付 → 当選 → 待機 → 落選)に送信する。
//   認証メール等の分を残すため予算は100通より少なめにしてある
// - 予算を使い切った分は翌日以降、Vercel Cron(/api/notify/process)が自動送信する。
//   管理画面の「送信待ちをいま送信する」でも手動で流せる
// - 毎秒2リクエスト制限のため、送信間隔を約0.6秒あける
// 年4回・応募300人なら月3,000通の枠には十分収まる(1回あたり約300〜400通)。
import type { PoolClient } from "pg";
import QRCode from "qrcode";
import { query } from "@/lib/db";
import { getNotifyChannel } from "@/lib/notify/channel";

export type NotificationKind =
  | "selection_won"
  | "promotion_won"
  | "waitlist_info"
  | "selection_lost"
  | "cancel_ack";

export const KIND_LABELS: Record<string, string> = {
  selection_won: "当選",
  promotion_won: "繰上当選",
  waitlist_info: "待機連絡",
  selection_lost: "落選連絡",
  cancel_ack: "キャンセル受付",
};

/** 選定・繰上・キャンセルのトランザクション内で呼ぶ: 送信待ちの通知を記録する */
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

function dailyLimit(): number {
  const n = Number(process.env.NOTIFY_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 90;
}

// 繰上・キャンセル受付は件数が少なく緊急度が高いので先に、
// 次に当選(QR付き)、待機、最後に落選の順で送る
const PRIORITY_SQL = `case n.kind
  when 'promotion_won' then 0 when 'cancel_ack' then 0
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
 * 送信キューの処理。1日の送信予算の残りの範囲で、優先度順に送信する。
 * maxSends を指定すると今回の処理量をさらに絞れる(選定直後の呼び出し等、
 * サーバー処理の時間制限内に収めたい場合)。
 */
export async function processNotificationQueue(opts?: {
  maxSends?: number;
}): Promise<QueueResult> {
  const sentToday = (
    await query<{ c: number }>(
      // Resend の無料枠のリセットに合わせて UTC の日付で数える
      "select count(*)::int as c from notifications where sent_at >= date_trunc('day', now())"
    )
  )[0].c;
  let budget = Math.max(0, dailyLimit() - sentToday);
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
      `select n.id, n.kind, n.email, n.subject, n.body,
              a.status as app_status, t.token as ticket_token
       from notifications n
       left join applications a on a.id = n.application_id
       left join tickets t on t.application_id = a.id and t.revoked_at is null
       where n.status = 'pending'
       order by ${PRIORITY_SQL}, n.created_at asc
       limit $1`,
      [budget]
    );

    const channel = getNotifyChannel();
    for (const n of rows) {
      const needQr = n.kind === "selection_won" || n.kind === "promotion_won";
      try {
        if (needQr && (n.app_status !== "won" || !n.ticket_token)) {
          // 送信前にキャンセルされた等。当選メールは送らず失敗として記録する
          await query(
            "update notifications set status = 'failed', error = $2 where id = $1",
            [n.id, "当選が取り消されたため送信を中止しました"]
          );
          failed++;
          continue;
        }
        // 毎秒2リクエスト制限(Resend)を守るため送信間隔をあける
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
        await channel.send({
          to: n.email,
          subject: n.subject,
          body: n.body,
          attachments,
        });
        await query(
          "update notifications set status = 'sent', sent_at = now() where id = $1",
          [n.id]
        );
        sent++;
      } catch (e) {
        await query(
          "update notifications set status = 'failed', error = $2 where id = $1",
          [n.id, e instanceof Error ? e.message : String(e)]
        );
        failed++;
      }
    }
  }

  const remaining = await countPendingNotifications();
  return { sent, failed, remaining };
}
