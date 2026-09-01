// 運営者が管理画面から変更できる設定(再デプロイ不要)
import { randomBytes } from "node:crypto";
import { query } from "@/lib/db";

export async function getSetting(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "select value from app_settings where key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `insert into app_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value]
  );
}

/**
 * ブックマークレット取込用のAPIトークン。
 * ブックマークレットは Fans' のページ上で動くため本システムのセッション Cookie を
 * 使えない。代わりにこのトークンで認証する(名簿の書き換えのみ可能。漏れたら再生成)。
 */
export async function getRosterImportToken(): Promise<string> {
  const existing = await getSetting("roster_import_token");
  if (existing) return existing;
  const token = randomBytes(24).toString("base64url");
  await setSetting("roster_import_token", token);
  return token;
}

export async function regenerateRosterImportToken(): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await setSetting("roster_import_token", token);
  return token;
}
