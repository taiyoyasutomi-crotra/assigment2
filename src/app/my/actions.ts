"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { setPassword } from "@/lib/auth/fansCode";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

// ログイン中の会員が自分のパスワードを設定/変更する。
// メールリンクでログインした人(パスワード未設定・忘れた人)の再設定口を兼ねる
export async function setPasswordAction(formData: FormData) {
  const member = await requireMember();
  const password = String(formData.get("password") || "");
  if (password.length < PASSWORD_MIN_LENGTH) {
    redirect("/my?error=weak_password");
  }
  await setPassword(member.id, password);
  redirect("/my?password_updated=1");
}
