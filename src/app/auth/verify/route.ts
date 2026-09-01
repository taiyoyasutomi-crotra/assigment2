import { NextResponse } from "next/server";
import { verifyLoginToken, authMode } from "@/lib/auth/fansCode";
import { createSession } from "@/lib/auth/session";
import { appUrl } from "@/lib/config";

// メール内の確認リンク。トークンを検証してログインセッションを張る
export async function GET(request: Request) {
  if (authMode() !== "fans_code") {
    return NextResponse.redirect(`${appUrl()}/login`);
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const result = token
    ? await verifyLoginToken(token)
    : ({ ok: false } as const);
  if (!result.ok) {
    return NextResponse.redirect(`${appUrl()}/login?error=invalid_link`);
  }
  await createSession(result.member.id);
  return NextResponse.redirect(
    result.member.role === "admin" ? `${appUrl()}/admin/events` : appUrl()
  );
}
