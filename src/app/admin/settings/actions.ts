"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { setSetting } from "@/lib/settings";
import { parseRosterCsv, replaceAllowlist, clearAllowlist } from "@/lib/allowlist";

// 紛らわしい文字(0/O/1/I/L)を除いた読み上げやすいコードを生成
function generateCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const seg = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `FANS-${seg()}-${seg()}`;
}

export async function generateJoinCodeAction() {
  await requireAdmin();
  await setSetting("fans_join_code", generateCode());
  redirect("/admin/settings?saved=1");
}

export async function setJoinCodeAction(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") || "").trim();
  if (code.length < 4 || code.length > 64 || /\s/.test(code)) {
    redirect("/admin/settings?error=bad_code");
  }
  await setSetting("fans_join_code", code);
  redirect("/admin/settings?saved=1");
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
