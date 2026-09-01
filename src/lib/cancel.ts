// キャンセルと繰上(F5)。
// 操作は「当選者の行のキャンセルボタン(1クリック)+ 確認ダイアログ(2重確認)」。
// 承認後は 1 トランザクションで キャンセル → チケット無効化 → 待機1位の繰上 →
// チケット発行 → 繰上当選通知の記録 まで実行する。
// キャンセル1件につき繰上は1件。同じ人が2回繰り上がることはない
// (繰上時に status が waitlisted → won に変わるため、次回の候補から外れる)。
import { withTransaction, query } from "@/lib/db";
import { PROMOTION_DEADLINE_HOURS } from "@/lib/config";
import { buildWinMail } from "@/lib/mail";
import { issueTicket } from "@/lib/tickets";
import { recordNotification, deliverNotification } from "@/lib/notify/notifications";

function promotionDeadline(startsAt: Date | string): Date {
  return new Date(
    new Date(startsAt).getTime() - PROMOTION_DEADLINE_HOURS * 3600 * 1000
  );
}

export type CancelPreview =
  | {
      ok: true;
      cancelName: string;
      promote: { name: string } | null;
      noPromoteReason: string | null;
    }
  | { ok: false; error: string };

/** 確認ダイアログ用: 誰をキャンセルし、誰が繰り上がるかを返す */
export async function previewCancel(applicationId: string): Promise<CancelPreview> {
  const rows = await query<{
    id: string;
    status: string;
    event_id: string;
    starts_at: Date;
    display_name: string;
  }>(
    `select a.id, a.status, a.event_id, e.starts_at, m.display_name
     from applications a
     join events e on e.id = a.event_id
     join members m on m.id = a.member_id
     where a.id = $1`,
    [applicationId]
  );
  const app = rows[0];
  if (!app) return { ok: false, error: "申込が見つかりません" };
  if (app.status !== "won")
    return { ok: false, error: "当選者以外はキャンセルできません" };

  const candidates = await query<{ display_name: string }>(
    `select m.display_name
     from applications a join members m on m.id = a.member_id
     where a.event_id = $1 and a.status = 'waitlisted'
     order by a.waitlist_order asc limit 1`,
    [app.event_id]
  );

  if (candidates.length === 0) {
    return {
      ok: true,
      cancelName: app.display_name,
      promote: null,
      noPromoteReason: "待機リストが空のため、繰上はありません",
    };
  }
  if (new Date() > promotionDeadline(app.starts_at)) {
    // TODO(hearing:Q7) 繰上締切は仮でイベント開始2時間前
    return {
      ok: true,
      cancelName: app.display_name,
      promote: null,
      noPromoteReason: `繰上締切(開始${PROMOTION_DEADLINE_HOURS}時間前)を過ぎているため、繰上はありません`,
    };
  }
  return {
    ok: true,
    cancelName: app.display_name,
    promote: { name: candidates[0].display_name },
    noPromoteReason: null,
  };
}

export type CancelResult =
  | { ok: true; cancelledName: string; promotedName: string | null }
  | { ok: false; error: string };

export async function executeCancel(applicationId: string): Promise<CancelResult> {
  const result = await withTransaction(async (client) => {
    // デッドロック回避のため、申込処理と同じくイベント行を先にロックする
    const appHead = await client.query(
      "select event_id from applications where id = $1",
      [applicationId]
    );
    if (!appHead.rows[0])
      return { ok: false as const, error: "申込が見つかりません", nid: null };
    const eventId: string = appHead.rows[0].event_id;

    const evRes = await client.query("select * from events where id = $1 for update", [
      eventId,
    ]);
    const event = evRes.rows[0];

    const appRes = await client.query(
      `select a.*, m.display_name from applications a
       join members m on m.id = a.member_id
       where a.id = $1 for update of a`,
      [applicationId]
    );
    const app = appRes.rows[0];
    if (!app || app.status !== "won") {
      return {
        ok: false as const,
        error: "当選者以外はキャンセルできません(処理済みの可能性があります)",
        nid: null,
      };
    }

    // 1) キャンセル + チケット無効化(無効化した QR は受付で「キャンセル済み」になる)
    await client.query("update applications set status = 'cancelled' where id = $1", [
      app.id,
    ]);
    await client.query(
      "update tickets set revoked_at = now() where application_id = $1 and revoked_at is null",
      [app.id]
    );

    // 2) 繰上: 待機1位を1件だけ。締切(開始2時間前)を過ぎていたら繰上なし
    let promotedName: string | null = null;
    let nid: string | null = null;
    if (new Date() <= promotionDeadline(event.starts_at)) {
      const candRes = await client.query(
        `select a.id, a.member_id, a.email, m.display_name
         from applications a join members m on m.id = a.member_id
         where a.event_id = $1 and a.status = 'waitlisted'
         order by a.waitlist_order asc
         limit 1
         for update of a`,
        [eventId]
      );
      const cand = candRes.rows[0];
      if (cand) {
        await client.query(
          "update applications set status = 'won', waitlist_order = null where id = $1",
          [cand.id]
        );
        const ticket = await issueTicket(client, cand.id);
        const mail = buildWinMail({
          event,
          displayName: cand.display_name,
          ticketId: ticket.id,
          kind: "promotion_won",
        });
        // 送信先は申込フォームで入力されたメールアドレス
        nid = await recordNotification(client, {
          memberId: cand.member_id,
          eventId,
          kind: "promotion_won",
          email: cand.email,
          subject: mail.subject,
          body: mail.body,
        });
        promotedName = cand.display_name;
      }
    }

    return {
      ok: true as const,
      cancelledName: app.display_name as string,
      promotedName,
      nid,
    };
  });

  if (result.ok && result.nid) await deliverNotification(result.nid);
  if (result.ok) {
    return {
      ok: true,
      cancelledName: result.cancelledName,
      promotedName: result.promotedName,
    };
  }
  return { ok: false, error: result.error };
}
