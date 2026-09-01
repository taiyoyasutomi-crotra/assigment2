// 通知の記録と配送。
// 記録(DB)はビジネス処理と同一トランザクションで行い、
// 配送(メール送信)はコミット後に行う。送信が失敗しても DB 更新は
// ロールバックせず、notifications.status = 'failed' として管理画面に表示する。
import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import { getNotifyChannel } from "./channel";

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

/** コミット済みの notification を実際に配送し、結果を記録する */
export async function deliverNotification(notificationId: string): Promise<void> {
  const rows = await query(
    "select id, email, subject, body from notifications where id = $1 and status = 'pending'",
    [notificationId]
  );
  const n = rows[0];
  if (!n) return;
  try {
    await getNotifyChannel().send({ to: n.email, subject: n.subject, body: n.body });
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
