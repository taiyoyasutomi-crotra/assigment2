"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { parseRosterCsv, replaceAllowlist, clearAllowlist } from "@/lib/allowlist";

export async function importAllowlistAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/settings?error=no_file");
  }
  if (file.size > 5 * 1024 * 1024) {
    redirect("/admin/settings?error=too_large");
  }
  const rows = parseRosterCsv(await (file as File).text());
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
