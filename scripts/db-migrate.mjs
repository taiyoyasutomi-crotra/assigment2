// db/migrations の SQL を DATABASE_URL の DB に適用する。
// 使い方: npm run db:migrate -- 011_survey_applications.sql
//        (ファイル名を複数並べると順に適用。省略時は一覧を表示)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL が設定されていません(.env を確認)");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log("適用するファイル名を指定してください。例:");
  console.log("  npm run db:migrate -- 011_survey_applications.sql");
  console.log("\ndb/migrations にあるファイル:");
  for (const f of readdirSync(dir).sort()) console.log(`  ${f}`);
  process.exit(1);
}

const ssl =
  process.env.DATABASE_SSL === "true" || /supabase\.(co|com)/.test(url)
    ? { rejectUnauthorized: false }
    : undefined;

const client = new pg.Client({ connectionString: url, ssl });
await client.connect();
try {
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log(`適用しました: ${f}`);
    } catch (e) {
      await client.query("rollback");
      console.error(`失敗しました: ${f}`);
      throw e;
    }
  }
} finally {
  await client.end();
}
