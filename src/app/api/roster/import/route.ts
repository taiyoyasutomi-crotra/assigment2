// ブックマークレットからの会員名簿取込(Fans' の管理画面上で実行される)。
// Fans' のページからのクロスオリジン POST になるため CORS を許可し、
// 認証はセッションではなく取込トークン(管理画面で発行・再生成)で行う。
// Content-Type: text/plain で送ることでプリフライトを不要にしている。
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getRosterImportToken } from "@/lib/settings";
import { parseRosterCsv, replaceAllowlist } from "@/lib/allowlist";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  let payload: { token?: string; csv?: string };
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  const token = typeof payload.token === "string" ? payload.token : "";
  const csv = typeof payload.csv === "string" ? payload.csv : "";

  const expected = await getRosterImportToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json({ ok: false, error: "unauthorized" }, 403);
  }

  if (csv.length > 5 * 1024 * 1024) {
    return json({ ok: false, error: "too_large" }, 413);
  }
  const rows = parseRosterCsv(csv);
  if (rows.length === 0) {
    return json({ ok: false, error: "no_emails" }, 400);
  }
  const count = await replaceAllowlist(rows);
  return json({ ok: true, count });
}
