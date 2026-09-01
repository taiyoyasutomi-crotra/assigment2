import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/auth/session";
import { checkinByToken } from "@/lib/tickets";

// QR 受付の照合(F6)。判定はすべてサーバー側で行う。
export async function POST(request: Request) {
  const member = await getSessionMember();
  if (!member || member.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const token = typeof body?.token === "string" ? body.token : "";
  if (!eventId || !token) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const result = await checkinByToken(eventId, token);
  return NextResponse.json(result);
}
