// 受付アカウント(当日スタッフ用)の管理。
// 運営者がイベントごとにメールアドレス+パスワードを払い出し、終了後に削除する。
// role=checkin の会員行として作り、担当イベント(checkin_event_id)に紐づける。
// アクセスできるのは担当イベントの受付画面(QR読取・参加者ボード)のみ(session.ts)。
import { query } from "@/lib/db";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

export type CheckinStaffRow = {
  id: string;
  display_name: string;
  email: string;
  created_at: Date;
};

export async function listCheckinStaff(eventId: string): Promise<CheckinStaffRow[]> {
  return query<CheckinStaffRow>(
    `select id, display_name, email, created_at from members
     where role = 'checkin' and checkin_event_id = $1
     order by created_at`,
    [eventId]
  );
}

export type CreateStaffResult = { ok: true } | { ok: false; error: string };

export async function createCheckinStaff(input: {
  eventId: string;
  displayName: string;
  email: string;
  password: string;
}): Promise<CreateStaffResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません" };
  }
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`,
    };
  }
  // ログインはメールアドレスで会員を特定するため、既存アカウントとの重複は不可
  const dup = await query("select 1 from members where lower(email) = $1 limit 1", [
    email,
  ]);
  if (dup.length > 0) {
    return {
      ok: false,
      error: "このメールアドレスは既に別のアカウントで使われています",
    };
  }
  await query(
    `insert into members (display_name, email, role, password_hash, checkin_event_id)
     values ($1, $2, 'checkin', $3, $4)`,
    [
      input.displayName.trim() || "受付スタッフ",
      email,
      hashPassword(input.password),
      input.eventId,
    ]
  );
  return { ok: true };
}

/** 受付アカウントの削除。role=checkin の行しか消せない(会員・運営者の誤削除防止) */
export async function deleteCheckinStaff(staffId: string): Promise<void> {
  await query("delete from members where id = $1 and role = 'checkin'", [staffId]);
}
