"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { parseRosterCsv, replaceAllowlist, clearAllowlist } from "@/lib/allowlist";

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
