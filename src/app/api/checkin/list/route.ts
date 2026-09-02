import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/auth/session";
import { listWinners } from "@/lib/tickets";

// 受付ボード用: 当選者の全一覧(入場状態つき)
export async function GET(request: Request) {
  const member = await getSessionMember();
  if (!member || member.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!eventId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const rows = await listWinners(eventId);
  return NextResponse.json({ rows });
}
