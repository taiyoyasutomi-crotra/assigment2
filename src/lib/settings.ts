// 運営者が管理画面から変更できる設定(再デプロイ不要)
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

/** 参加コード。DB優先、未設定なら環境変数 FANS_JOIN_CODE をフォールバック */
export async function getJoinCode(): Promise<string | null> {
  return (await getSetting("fans_join_code")) || process.env.FANS_JOIN_CODE || null;
}
