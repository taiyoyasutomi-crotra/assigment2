// 死活監視用ヘルスチェック。外形監視(.github/workflows/uptime.yml)が叩く。
// ページの描画だけでなく DB 接続まで確認する(DB 障害も検知できるように)。
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await query("select 1");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
