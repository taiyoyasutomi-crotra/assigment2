"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { applyToEvent } from "@/lib/applications";

export async function applyAction(formData: FormData) {
  const member = await requireMember();
  const eventId = String(formData.get("eventId") || "");
  // 運営者アカウントは申込不可(画面でも出さないが、サーバー側でも弾く)
  if (member.role === "admin") {
    redirect(`/events/${eventId}?error=admin_cannot_apply`);
  }
  const email = String(formData.get("email") || "");

  const result = await applyToEvent(eventId, member.id, email);
  if (result.ok) {
    redirect(`/events/${eventId}?applied=1`);
  }
  redirect(`/events/${eventId}?error=${result.error}`);
}
