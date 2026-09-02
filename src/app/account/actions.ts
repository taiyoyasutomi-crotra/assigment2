"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { setPassword } from "@/lib/auth/fansCode";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

// ログイン中の本人が自分のパスワードを設定/変更する。
// 会員はアカウントページ、運営者は管理ページ(from=admin)から使う
export async function setPasswordAction(formData: FormData) {
  const member = await requireMember();
  const back = formData.get("from") === "admin" ? "/admin/settings" : "/account";
  const password = String(formData.get("password") || "");
  if (password.length < PASSWORD_MIN_LENGTH) {
    redirect(`${back}?error=weak_password`);
  }
  await setPassword(member.id, password);
  redirect(`${back}?password_updated=1`);
}
