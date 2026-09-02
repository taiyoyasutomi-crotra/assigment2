// デモ用: 既存の有効な全アカウントに同一パスワードを設定する。
// 使い方: DATABASE_URL='...' [PASSWORD='a12345'] node scripts/set-demo-passwords.mjs
// ※デモ環境専用。本番運用では絶対に使わない(全員が同じパスワードになる)
import pg from "pg";
import { randomBytes, scryptSync } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL が設定されていません");
  process.exit(1);
}
const password = process.env.PASSWORD || "a12345";

const salt = randomBytes(16).toString("base64url");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 32).toString("base64url")}`;

const ssl =
  process.env.DATABASE_SSL === "true" || /supabase\.(co|com)/.test(url)
    ? { rejectUnauthorized: false }
    : undefined;

const client = new pg.Client({ connectionString: url, ssl });
await client.connect();
try {
  const res = await client.query(
    "update members set password_hash = $1 where is_active returning email",
    [hash]
  );
  console.log(`パスワードを設定しました: ${res.rowCount}アカウント`);
} finally {
  await client.end();
}
