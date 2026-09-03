"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { parseRosterCsv, replaceAllowlist, clearAllowlist } from "@/lib/allowlist";
import { addAdmin, removeAdmin } from "@/lib/admins";
import { createCheckinStaff, deleteCheckinStaff } from "@/lib/checkinStaff";

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
    redirect("/admin/settings?error=no_file");
  }
  if (file.size > 5 * 1024 * 1024) {
    redirect("/admin/settings?error=too_large");
  }
  const rows = parseRosterCsv(decodeCsv(await (file as File).arrayBuffer()));
  if (rows.length === 0) {
    redirect("/admin/settings?error=no_emails");
  }
  const count = await replaceAllowlist(rows);
  redirect(`/admin/settings?imported=${count}`);
}

export async function clearAllowlistAction() {
  await requireAdmin();
  await clearAllowlist();
  redirect("/admin/settings?cleared=1");
}

export async function addAdminAction(formData: FormData) {
  await requireAdmin();
  const result = await addAdmin({
    displayName: String(formData.get("displayName") || ""),
    email: String(formData.get("email") || ""),
  });
  if (!result.ok) redirect(`/admin/settings?error=${result.error}`);
  redirect("/admin/settings?admin_added=1");
}

export async function removeAdminAction(formData: FormData) {
  const me = await requireAdmin();
  const result = await removeAdmin(String(formData.get("memberId") || ""), me.id);
  if (!result.ok) redirect(`/admin/settings?error=admin_${result.error}`);
  redirect("/admin/settings?admin_removed=1");
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
    redirect(`/admin/settings?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/settings?staff_created=1");
}

/** 受付アカウントの削除(イベント終了後の後片付け) */
export async function deleteCheckinStaffAction(formData: FormData) {
  await requireAdmin();
  await deleteCheckinStaff(String(formData.get("staffId") || ""));
  redirect("/admin/settings?staff_deleted=1");
}

/** CSVの中身を貼り付けて取込(ブックマークレットが使えない場合の代替) */
export async function pasteImportAction(formData: FormData) {
  await requireAdmin();
  const text = String(formData.get("csv") || "");
  if (text.length > 5 * 1024 * 1024) {
    redirect("/admin/settings?error=too_large");
  }
  const rows = parseRosterCsv(text);
  if (rows.length === 0) {
    redirect("/admin/settings?error=no_emails");
  }
  const count = await replaceAllowlist(rows);
  redirect(`/admin/settings?imported=${count}`);
}
