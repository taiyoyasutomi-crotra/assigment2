"use server";

import { redirect } from "next/navigation";
import { authMode, resetPasswordWithToken } from "@/lib/auth/fansCode";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

// 再設定メールのリンクから開いた画面で、新しいパスワードを設定してそのままログイン
export async function resetPasswordAction(formData: FormData) {
  if (authMode() !== "fans_code") redirect("/login");
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (password.length < PASSWORD_MIN_LENGTH) {
    redirect(`/auth/reset?token=${encodeURIComponent(token)}&error=weak_password`);
  }
  const result = await resetPasswordWithToken(token, password);
  if (!result.ok) redirect("/login?tab=link&error=invalid_link");
  await createSession(result.member.id);
  redirect("/account?password_updated=1");
}
