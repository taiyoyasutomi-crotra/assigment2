"use server";

import { redirect } from "next/navigation";
import { authProvider } from "@/lib/auth/provider";
import { authMode, requestLoginLink, loginWithPassword } from "@/lib/auth/fansCode";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

// モック認証: 会員を選ぶだけでログインできる(AUTH_MODE=mock のときのみ)。
// 本番運用は fans_code(参加コード+メール確認リンク)。 TODO(hearing:Q1)
export async function loginAction(formData: FormData) {
  if (authMode() !== "mock") redirect("/login");
  const memberId = String(formData.get("memberId") || "");
  const member = await authProvider.authenticate(memberId);
  if (!member) redirect("/login?error=1");
  await createSession(member.id);
  redirect(member.role === "admin" ? "/admin/events" : "/");
}

// fans_code 認証: メールアドレス+パスワードでログイン
export async function passwordLoginAction(formData: FormData) {
  if (authMode() !== "fans_code") redirect("/login");
  const result = await loginWithPassword({
    email: String(formData.get("email") || ""),
    password: String(formData.get("password") || ""),
  });
  if (!result.ok) redirect(`/login?error=${result.error}`);
  await createSession(result.member.id);
  redirect(result.member.role === "admin" ? "/admin/events" : "/");
}

// fans_code 認証: 登録済みアドレスにパスワード再設定リンクをメール送信
// (パスワードを忘れた/未設定の場合の入口。リンク先で新パスワードを設定してそのままログイン)
export async function requestResetAction(formData: FormData) {
  if (authMode() !== "fans_code") redirect("/login");
  const result = await requestLoginLink({
    email: String(formData.get("email") || ""),
    displayName: "",
    mode: "reset",
  });
  if (!result.ok) redirect(`/login?tab=link&error=${result.error}`);
  redirect("/login?tab=link&sent=1");
}

// fans_code 認証: 未登録アドレスにアカウント登録の確認リンクをメール送信。
// パスワードはこの時点でハッシュ化して預かり、リンクを開いた時点で会員に設定される
export async function requestSignupAction(formData: FormData) {
  if (authMode() !== "fans_code") redirect("/login");
  const password = String(formData.get("password") || "");
  if (password.length < PASSWORD_MIN_LENGTH) {
    redirect("/login?tab=signup&error=weak_password");
  }
  const result = await requestLoginLink({
    email: String(formData.get("email") || ""),
    displayName: String(formData.get("displayName") || ""),
    mode: "signup",
    passwordHash: hashPassword(password),
  });
  if (!result.ok) redirect(`/login?tab=signup&error=${result.error}`);
  redirect("/login?tab=signup&sent=1");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
