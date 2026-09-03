import { NextResponse } from "next/server";
import { getSessionMember, canCheckin } from "@/lib/auth/session";
import { checkinByToken } from "@/lib/tickets";

// QR 受付の照合(F6)。判定はすべてサーバー側で行う。
// 運営者と、このイベント担当の受付アカウント(role=checkin)のみ利用可
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const token = typeof body?.token === "string" ? body.token : "";
  if (!eventId || !token) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const member = await getSessionMember();
  if (!canCheckin(member, eventId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const result = await checkinByToken(eventId, token);
  return NextResponse.json(result);
}
