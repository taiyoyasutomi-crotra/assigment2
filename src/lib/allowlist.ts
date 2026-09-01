// Fans' の会員名簿(CSVエクスポート)取り込み。
// 会員判定の正はこの名簿: 名簿に載っているメールアドレスだけがログインできる。
// CSV の表示名があれば初回登録時の表示名として使う(Fans' 側の表示名を引き継げる)。
// 新会員の追加・退会者の除外は最新 CSV の再取り込みで反映する(洗い替え)。
import { query } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function allowlistSummary(): Promise<{
  count: number;
  lastImportedAt: Date | null;
}> {
  const rows = await query<{ c: number; last: Date | null }>(
    "select count(*)::int as c, max(imported_at) as last from member_allowlist"
  );
  return { count: rows[0].c, lastImportedAt: rows[0].last };
}

export async function allowlistLookup(
  email: string
): Promise<{ email: string; display_name: string | null } | null> {
  const rows = await query(
    "select email, display_name from member_allowlist where email = $1",
    [email.toLowerCase()]
  );
  return rows[0] ?? null;
}

/**
 * CSV テキストを取り込む(洗い替え方式: 取り込むたびに全置換)。
 * Fans' の CSV の列構成に依存しないよう、各行から
 * メールアドレス形式のフィールドを探し、その行の別の非空フィールドを表示名とみなす。
 */
export function parseRosterCsv(
  text: string
): { email: string; displayName: string | null }[] {
  const seen = new Map<string, string | null>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = line
      .split(/[,\t;]/)
      .map((f) => f.trim().replace(/^"|"$/g, ""));
    const email = fields.find((f) => EMAIL_RE.test(f));
    if (!email) continue; // ヘッダ行やメールなし行はスキップ
    const displayName =
      fields.find((f) => f && f !== email && !EMAIL_RE.test(f) && !/^\d+$/.test(f)) ??
      null;
    seen.set(email.toLowerCase(), displayName);
  }
  return [...seen.entries()].map(([email, displayName]) => ({ email, displayName }));
}

export async function replaceAllowlist(
  rows: { email: string; displayName: string | null }[]
): Promise<number> {
  await query("delete from member_allowlist");
  for (const r of rows) {
    await query(
      `insert into member_allowlist (email, display_name) values ($1, $2)
       on conflict (email) do update set display_name = excluded.display_name, imported_at = now()`,
      [r.email, r.displayName]
    );
  }
  return rows.length;
}

export async function clearAllowlist(): Promise<void> {
  await query("delete from member_allowlist");
}
