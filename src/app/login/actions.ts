"use server";

import { redirect } from "next/navigation";
import { authProvider } from "@/lib/auth/provider";
import { createSession, destroySession } from "@/lib/auth/session";

// モック認証: 会員を選ぶだけでログインできる。
// 本実装ではコミュニティ基盤の OAuth に差し替える。 TODO(hearing:Q1)
export async function loginAction(formData: FormData) {
  const memberId = String(formData.get("memberId") || "");
  const member = await authProvider.authenticate(memberId);
  if (!member) redirect("/login?error=1");
  await createSession(member.id);
  redirect(member.role === "admin" ? "/admin/events" : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
