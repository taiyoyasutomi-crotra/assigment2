// F3 受け入れ条件「同時に複数の申込が来ても上限を超えない」の並列テスト。
// src/lib/applications.ts の applyToEvent と同じ SQL シーケンスを
// 10 本の並列コネクションで実行し、上限(5)を超えないことを確認する。
// 使い方: node --env-file-if-exists=.env scripts/test-concurrent-apply.mjs
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

const pool = new pg.Pool({ connectionString: url, ssl, max: 12 });

// applyToEvent と同じトランザクション(イベント行ロックで直列化)
async function apply(eventId, memberId, email) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const ev = (
      await client.query("select * from events where id = $1 for update", [eventId])
    ).rows[0];
    if (!ev || ev.status !== "open") {
      await client.query("rollback");
      return "closed";
    }
    const count = (
      await client.query(
        "select count(*)::int as c from applications where event_id = $1 and status <> 'cancelled'",
        [eventId]
      )
    ).rows[0].c;
    if (count >= ev.application_limit) {
      await client.query("update events set status = 'closed' where id = $1", [eventId]);
      await client.query("commit");
      return "closed";
    }
    await client.query(
      "insert into applications (event_id, member_id, email) values ($1, $2, $3)",
      [eventId, memberId, email]
    );
    if (count + 1 >= ev.application_limit) {
      await client.query("update events set status = 'closed' where id = $1", [eventId]);
    }
    await client.query("commit");
    return "ok";
  } catch (e) {
    await client.query("rollback");
    return "error: " + e.message;
  } finally {
    client.release();
  }
}

// テストデータ作成(上限5のイベント + 会員10名)
const setup = await pool.connect();
const memberIds = [];
let eventId;
try {
  await setup.query("begin");
  const ev = await setup.query(
    `insert into events (title, starts_at, venue, capacity, application_limit, closes_at, status)
     values ('並列テスト', now() + interval '7 days', 'テスト会場', 5, 5,
             now() + interval '3 days', 'open') returning id`
  );
  eventId = ev.rows[0].id;
  for (let i = 0; i < 10; i++) {
    const m = await setup.query(
      "insert into members (display_name, email) values ($1, $2) returning id",
      [`並列テスト${i}`, `parallel-test-${i}@example.com`]
    );
    memberIds.push(m.rows[0].id);
  }
  await setup.query("commit");
} finally {
  setup.release();
}

// 10 並列で一斉に申込
const results = await Promise.all(
  memberIds.map((mid, i) => apply(eventId, mid, `parallel-test-${i}@example.com`))
);
const okCount = results.filter((r) => r === "ok").length;
const closedCount = results.filter((r) => r === "closed").length;

const finalCount = (
  await pool.query(
    "select count(*)::int as c from applications where event_id = $1",
    [eventId]
  )
).rows[0].c;
const finalStatus = (
  await pool.query("select status from events where id = $1", [eventId])
).rows[0].status;

console.log(`結果: ok=${okCount} closed=${closedCount} errors=${results.filter((r) => r.startsWith?.("error")).length}`);
console.log(`最終申込数: ${finalCount} / 上限5, イベント状態: ${finalStatus}`);

const pass = finalCount === 5 && okCount === 5 && closedCount === 5 && finalStatus === "closed";
console.log(pass ? "PASS: 上限を超えず、自動締切も発動" : "FAIL");

// テストデータ削除
await pool.query("delete from applications where event_id = $1", [eventId]);
await pool.query("delete from events where id = $1", [eventId]);
await pool.query("delete from members where id = any($1)", [memberIds]);
await pool.end();
process.exit(pass ? 0 : 1);
