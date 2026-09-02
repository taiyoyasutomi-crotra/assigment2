// 既存DBにパスワード認証用の列を追加する(データは消さない)。
// 使い方: DATABASE_URL='...' node scripts/migrate-password.mjs
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL が設定されていません");
  process.exit(1);
}

const ssl =
  process.env.DATABASE_SSL === "true" || /supabase\.(co|com)/.test(url)
    ? { rejectUnauthorized: false }
    : undefined;

const client = new pg.Client({ connectionString: url, ssl });
await client.connect();
try {
  await client.query(
    "alter table members add column if not exists password_hash text"
  );
  await client.query(
    "alter table login_tokens add column if not exists password_hash text"
  );
  console.log("マイグレーション完了: password_hash 列を追加しました");
} finally {
  await client.end();
}
