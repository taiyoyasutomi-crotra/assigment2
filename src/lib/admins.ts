// 運営者の管理。運営者は Fans' の会員名簿(CSV)に載らないため、
// members テーブルの role='admin' で管理する。
// 削除は行削除ではなく無効化(is_active=false): 過去の申込・通知履歴との参照を保つ。
import { query } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminRow = { id: string; display_name: string; email: string };

export async function listAdmins(): Promise<AdminRow[]> {
  return query<AdminRow>(
    "select id, display_name, email from members where role = 'admin' and is_active order by created_at"
  );
}

export type UserRow = {
  id: string;
  display_name: string;
  email: string;
  role: "member" | "admin" | "checkin";
};

/** 全ユーザー一覧(パスワード初期化の対象選択用)。運営者→受付→会員の順 */
export async function listAllUsers(): Promise<UserRow[]> {
  return query<UserRow>(
    `select id, display_name, email, role from members where is_active
     order by case role when 'admin' then 0 when 'checkin' then 1 else 2 end,
              display_name`
  );
}

export type AddAdminResult =
  | { ok: true }
  | { ok: false; error: "invalid_email" | "invalid_name" };

export async function addAdmin(input: {
  displayName: string;
  email: string;
}): Promise<AddAdminResult> {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  if (!displayName) return { ok: false, error: "invalid_name" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };

  // 同じメールアドレスの会員がいれば運営者に昇格(無効化済みなら復帰)、いなければ新規作成
  const existing = await query<{ id: string }>(
    "select id from members where lower(email) = $1 order by created_at limit 1",
    [email]
  );
  if (existing[0]) {
    await query(
      "update members set role = 'admin', is_active = true, display_name = $2 where id = $1",
      [existing[0].id, displayName]
    );
  } else {
    await query(
      "insert into members (display_name, email, role) values ($1, $2, 'admin')",
      [displayName, email]
    );
  }
  return { ok: true };
}

export type RemoveAdminResult =
  | { ok: true }
  | { ok: false; error: "self" | "not_found" };

export async function removeAdmin(
  id: string,
  currentMemberId: string
): Promise<RemoveAdminResult> {
  // 自分自身は削除不可(全運営者が消えて誰も管理できなくなる事故の防止)
  if (id === currentMemberId) return { ok: false, error: "self" };
  const rows = await query<{ id: string }>(
    "update members set is_active = false where id = $1 and role = 'admin' and is_active returning id",
    [id]
  );
  return rows[0] ? { ok: true } : { ok: false, error: "not_found" };
}
