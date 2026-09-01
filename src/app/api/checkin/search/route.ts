import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/auth/session";
import { searchWinners } from "@/lib/tickets";

// QR が読めない場合の手動検索(表示名、当選者のみ)
export async function GET(request: Request) {
  const member = await getSessionMember();
  if (!member || member.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") ?? "";
  const q = url.searchParams.get("q") ?? "";
  if (!eventId || !q.trim()) {
    return NextResponse.json({ rows: [] });
  }
  const rows = await searchWinners(eventId, q.trim());
  return NextResponse.json({ rows });
}
