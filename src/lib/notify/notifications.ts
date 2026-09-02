// 通知の記録と配送。
// 記録(DB)はビジネス処理と同一トランザクションで行い、
// 配送(メール送信)はコミット後に行う。送信が失敗しても DB 更新は
// ロールバックせず、notifications.status = 'failed' として管理画面に表示する。
import type { PoolClient } from "pg";
import QRCode from "qrcode";
import { query } from "@/lib/db";
import { getNotifyChannel, type NotifyAttachment } from "./channel";

export type NotificationKind = "selection_won" | "promotion_won";

export async function recordNotification(
  client: PoolClient,
  input: {
    memberId: string;
    eventId: string;
    kind: NotificationKind;
    email: string;
    subject: string;
    body: string;
  }
): Promise<string> {
  const res = await client.query(
    `insert into notifications (member_id, event_id, kind, email, subject, body)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [input.memberId, input.eventId, input.kind, input.email, input.subject, input.body]
  );
  return res.rows[0].id as string;
}

/**
 * 当選系通知には入場QRコード(PNG)を添付する。
 * QRの中身はチケットの照合トークン(チケットごとに一意。全員別のQRになる)
 */
async function buildAttachments(n: {
  kind: string;
  member_id: string;
  event_id: string;
}): Promise<NotifyAttachment[] | undefined> {
  if (n.kind !== "selection_won" && n.kind !== "promotion_won") return undefined;
  const rows = await query<{ token: string }>(
    `select t.token from tickets t
     join applications a on a.id = t.application_id
     where a.member_id = $1 and a.event_id = $2 and t.revoked_at is null
     order by t.created_at desc limit 1`,
    [n.member_id, n.event_id]
  );
  if (!rows[0]) return undefined;
  const png = await QRCode.toBuffer(rows[0].token, { width: 480, margin: 2 });
  return [{ filename: "入場QRコード.png", content: png }];
}

/** コミット済みの notification を実際に配送し、結果を記録する */
export async function deliverNotification(notificationId: string): Promise<void> {
  const rows = await query(
    `select id, email, subject, body, kind, member_id, event_id
     from notifications where id = $1 and status = 'pending'`,
    [notificationId]
  );
  const n = rows[0];
  if (!n) return;
  try {
    const attachments = await buildAttachments(n);
    await getNotifyChannel().send({
      to: n.email,
      subject: n.subject,
      body: n.body,
      attachments,
    });
    await query(
      "update notifications set status = 'sent', sent_at = now() where id = $1",
      [n.id]
    );
  } catch (e) {
    await query(
      "update notifications set status = 'failed', error = $2 where id = $1",
      [n.id, e instanceof Error ? e.message : String(e)]
    );
  }
}

export async function deliverAll(ids: string[]): Promise<void> {
  for (const id of ids) await deliverNotification(id);
}
