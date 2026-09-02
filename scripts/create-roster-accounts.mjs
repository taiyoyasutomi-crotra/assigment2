// デモ用: 会員名簿(member_allowlist)の各アドレスに会員アカウントを作成する。
// 既にアカウントがあるアドレスはスキップ。パスワードは PASSWORD(既定 a12345)。
// 使い方: DATABASE_URL='...' [PASSWORD='a12345'] node scripts/create-roster-accounts.mjs
// ※デモ環境専用(本来アカウントは本人がアカウント作成から登録する)
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
    `insert into members (display_name, email, role, password_hash)
     select coalesce(a.display_name, split_part(a.email, '@', 1)), a.email, 'member', $1
     from member_allowlist a
     where not exists (
       select 1 from members m where lower(m.email) = a.email
     )
     returning email`,
    [hash]
  );
  console.log(`アカウントを作成しました: ${res.rowCount}件`);
  for (const r of res.rows) console.log(`  ${r.email}`);
} finally {
  await client.end();
}
