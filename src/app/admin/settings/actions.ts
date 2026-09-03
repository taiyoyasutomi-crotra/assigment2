"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { parseRosterCsv, replaceAllowlist, clearAllowlist } from "@/lib/allowlist";
import { addAdmin, removeAdmin } from "@/lib/admins";
import { createCheckinStaff, deleteCheckinStaff } from "@/lib/checkinStaff";
import { setPassword } from "@/lib/auth/fansCode";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { query } from "@/lib/db";

// 日本語サービスのCSVは Shift_JIS(cp932)が多いため、UTF-8 で読めない場合は
// Shift_JIS として読み直す(メールは ASCII なのでどちらでも取れるが、表示名が化ける)
function decodeCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("shift_jis").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf); // 最後の手段(化け許容)
    }
  }
}

export async function importAllowlistAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/settings?tab=roster&error=no_file");
  }
  if (file.size > 5 * 1024 * 1024) {
    redirect("/admin/settings?tab=roster&error=too_large");
  }
  const rows = parseRosterCsv(decodeCsv(await (file as File).arrayBuffer()));
  if (rows.length === 0) {
    redirect("/admin/settings?tab=roster&error=no_emails");
  }
  const count = await replaceAllowlist(rows);
  redirect(`/admin/settings?tab=roster&imported=${count}`);
}

export async function clearAllowlistAction() {
  await requireAdmin();
  await clearAllowlist();
  redirect("/admin/settings?tab=roster&cleared=1");
}

export async function addAdminAction(formData: FormData) {
  await requireAdmin();
  const result = await addAdmin({
    displayName: String(formData.get("displayName") || ""),
    email: String(formData.get("email") || ""),
  });
  if (!result.ok) redirect(`/admin/settings?tab=admins&error=${result.error}`);
  redirect("/admin/settings?tab=admins&admin_added=1");
}

export async function removeAdminAction(formData: FormData) {
  const me = await requireAdmin();
  const result = await removeAdmin(String(formData.get("memberId") || ""), me.id);
  if (!result.ok) redirect(`/admin/settings?tab=admins&error=admin_${result.error}`);
  redirect("/admin/settings?tab=admins&admin_removed=1");
}

/** 受付アカウントの払い出し(当日スタッフ用。担当イベントの受付画面のみ利用可) */
export async function createCheckinStaffAction(formData: FormData) {
  await requireAdmin();
  const result = await createCheckinStaff({
    eventId: String(formData.get("eventId") || ""),
    displayName: String(formData.get("displayName") || ""),
    email: String(formData.get("email") || ""),
    password: String(formData.get("password") || ""),
  });
  if (!result.ok) {
    redirect(`/admin/settings?tab=staff&error=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/settings?tab=staff&staff_created=1");
}

/** 受付アカウントの削除(イベント終了後の後片付け) */
export async function deleteCheckinStaffAction(formData: FormData) {
  await requireAdmin();
  await deleteCheckinStaff(String(formData.get("staffId") || ""));
  redirect("/admin/settings?tab=staff&staff_deleted=1");
}

/**
 * 任意のユーザーのパスワード初期化(運営者のみ)。
 * 運営者が新しいパスワードを決めて上書きし、本人に伝える運用。
 */
export async function resetUserPasswordAction(formData: FormData) {
  await requireAdmin();
  // 戻り先タブ(ロール別のパスワード管理タブ)。不正値は運営者タブに落とす
  const rawTab = String(formData.get("tab") || "");
  const tab = ["pw_admin", "pw_checkin", "pw_member"].includes(rawTab)
    ? rawTab
    : "pw_admin";
  const memberId = String(formData.get("memberId") || "");
  const password = String(formData.get("password") || "");
  if (!memberId) redirect(`/admin/settings?tab=${tab}&error=user_not_found`);
  if (password.length < PASSWORD_MIN_LENGTH) {
    redirect(`/admin/settings?tab=${tab}&error=weak_password`);
  }
  const rows = await query<{ id: string }>(
    "select id from members where id = $1 and is_active",
    [memberId]
  );
  if (!rows[0]) redirect(`/admin/settings?tab=${tab}&error=user_not_found`);
  await setPassword(memberId, password);
  redirect(`/admin/settings?tab=${tab}&pw_reset=1`);
}
