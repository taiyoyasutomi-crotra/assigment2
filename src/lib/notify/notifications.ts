// 当選・繰上のお知らせ(アプリ内通知)。
// メールでは送らない(2026-09-03 顧客判断): Resend無料枠(100通/日)の制約を受けず、
// 応募が何百件でも破綻しない。結果はマイページの「お知らせ」と申込状況で確認する。
// メール送信は認証(ログインリンク・パスワード再設定 → lib/auth/fansCode.ts)のみ。
// 記録はビジネス処理(選定・繰上)と同一トランザクションで行う。
import type { PoolClient } from "pg";
import { query } from "@/lib/db";

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
  // アプリ内通知は作成した時点で「配信済み」
  const res = await client.query(
    `insert into notifications (member_id, event_id, kind, email, subject, body, status, sent_at)
     values ($1, $2, $3, $4, $5, $6, 'sent', now()) returning id`,
    [input.memberId, input.eventId, input.kind, input.email, input.subject, input.body]
  );
  return res.rows[0].id as string;
}

export type MyNotification = {
  id: string;
  kind: string;
  subject: string;
  body: string;
  created_at: Date;
  read_at: Date | null;
};

/** 会員向け: 自分宛のお知らせ一覧(新しい順。削除済みは除く) */
export async function listMyNotifications(memberId: string): Promise<MyNotification[]> {
  return query<MyNotification>(
    `select id, kind, subject, body, created_at, read_at
     from notifications where member_id = $1 and deleted_at is null
     order by created_at desc`,
    [memberId]
  );
}

/** 会員向け: 未読のお知らせ数(ナビのバッジ表示用) */
export async function countUnreadNotifications(memberId: string): Promise<number> {
  const rows = await query<{ c: number }>(
    `select count(*)::int as c from notifications
     where member_id = $1 and read_at is null and deleted_at is null`,
    [memberId]
  );
  return rows[0].c;
}

/** 会員向け: 自分宛のお知らせをすべて既読にする */
export async function markAllNotificationsRead(memberId: string): Promise<void> {
  await query(
    "update notifications set read_at = now() where member_id = $1 and read_at is null",
    [memberId]
  );
}

/**
 * 会員向け: お知らせの削除(本人のもののみ)。
 * 行は消さずソフト削除にする: 運営側の通知履歴(配信・既読の記録)は残る
 */
export async function deleteMyNotification(
  notificationId: string,
  memberId: string
): Promise<void> {
  await query(
    `update notifications set deleted_at = now()
     where id = $1 and member_id = $2 and deleted_at is null`,
    [notificationId, memberId]
  );
}
