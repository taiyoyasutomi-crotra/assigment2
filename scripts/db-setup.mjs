// db/schema.sql を DATABASE_URL の DB に適用する。
// 使い方: npm run db:setup
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL が設定されていません(.env を確認)");
  process.exit(1);
}

const ssl =
  process.env.DATABASE_SSL === "true" || /supabase\.(co|com)/.test(url)
    ? { rejectUnauthorized: false }
    : undefined;

const client = new pg.Client({ connectionString: url, ssl });
const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "schema.sql");

await client.connect();
try {
  await client.query(readFileSync(schemaPath, "utf8"));
  console.log("スキーマを適用しました");
} finally {
  await client.end();
}
