"use server";

import { redirect } from "next/navigation";
import { authProvider } from "@/lib/auth/provider";
import { authMode, requestLoginLink } from "@/lib/auth/fansCode";
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

// fans_code 認証: 参加コードを検証してログインリンクをメール送信
export async function requestLoginLinkAction(formData: FormData) {
  if (authMode() !== "fans_code") redirect("/login");
  const result = await requestLoginLink({
    email: String(formData.get("email") || ""),
    displayName: String(formData.get("displayName") || ""),
    joinCode: String(formData.get("joinCode") || ""),
  });
  if (!result.ok) redirect(`/login?error=${result.error}`);
  redirect("/login?sent=1");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
