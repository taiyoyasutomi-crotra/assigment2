import { NextResponse } from "next/server";
import { getSessionMember, canCheckin } from "@/lib/auth/session";
import { listWinners } from "@/lib/tickets";

// 受付ボード用: 当選者の全一覧(入場状態つき)。
// 運営者と、このイベント担当の受付アカウント(role=checkin)のみ利用可
export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!eventId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const member = await getSessionMember();
  if (!canCheckin(member, eventId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const rows = await listWinners(eventId);
  return NextResponse.json({ rows });
}
