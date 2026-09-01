"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { applyToEvent } from "@/lib/applications";

export async function applyAction(formData: FormData) {
  const member = await requireMember();
  const eventId = String(formData.get("eventId") || "");
  const email = String(formData.get("email") || "");

  const result = await applyToEvent(eventId, member.id, email);
  if (result.ok) {
    redirect(`/events/${eventId}?applied=1`);
  }
  redirect(`/events/${eventId}?error=${result.error}`);
}
