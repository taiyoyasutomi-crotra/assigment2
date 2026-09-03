import { NextResponse } from "next/server";
import { getSessionMember, canCheckin } from "@/lib/auth/session";
import { setCheckedIn } from "@/lib/tickets";

// 受付ボードからの手動入場/入場取消。
// 運営者と、このイベント担当の受付アカウント(role=checkin)のみ利用可
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const applicationId =
    typeof body?.applicationId === "string" ? body.applicationId : "";
  const checkedIn = body?.checkedIn === true;
  if (!eventId || !applicationId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const member = await getSessionMember();
  if (!canCheckin(member, eventId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const result = await setCheckedIn(eventId, applicationId, checkedIn);
  return NextResponse.json(result);
}
