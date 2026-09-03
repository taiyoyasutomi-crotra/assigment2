// 同時申込バースト試験: 一時イベント+一時会員300名を作り、
// applyToEvent と同じSQLシーケンス(イベント行ロックで直列化)を
// 60並列コネクションで一斉実行し、全件完了までの時間を測る。
// 終了後に一時データを削除する。
import pg from "pg";

const N = Number(process.argv[2] || 300);
const CONC = Number(process.argv[3] || 60);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: CONC });

// 準備
const ev = await pool.query(
  `insert into events (title, starts_at, venue, capacity, closes_at, status)
   values ('LOADTEST', now() + interval '30 days', 'loadtest', 10, now() + interval '20 days', 'open')
   returning id`
);
const eventId = ev.rows[0].id;
const memberIds = [];
for (let i = 0; i < N; i++) {
  const r = await pool.query(
    "insert into members (display_name, email) values ($1, $2) returning id",
    [`LT${i}`, `lt${i}@loadtest.example.com`]
  );
  memberIds.push(r.rows[0].id);
}

async function apply(memberId, email) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const evr = await client.query("select * from events where id = $1 for update", [eventId]);
    const event = evr.rows[0];
    if (event.status !== "open") { await client.query("rollback"); return "closed"; }
    const dup = await client.query(
      "select 1 from applications where event_id = $1 and member_id = $2",
      [eventId, memberId]
    );
    if (dup.rows.length) { await client.query("rollback"); return "already"; }
    const edup = await client.query(
      `select 1 from applications where event_id = $1 and lower(email) = lower($2) and status <> 'cancelled'`,
      [eventId, email]
    );
    if (edup.rows.length) { await client.query("rollback"); return "dup_email"; }
    await client.query(
      "insert into applications (event_id, member_id, email) values ($1, $2, $3)",
      [eventId, memberId, email]
    );
    await client.query("commit");
    return "ok";
  } catch (e) {
    await client.query("rollback");
    return "error:" + e.message;
  } finally {
    client.release();
  }
}

const t0 = Date.now();
const results = await Promise.all(
  memberIds.map((id, i) => apply(id, `lt${i}@loadtest.example.com`))
);
const ms = Date.now() - t0;
const ok = results.filter((r) => r === "ok").length;
const errors = results.filter((r) => r.startsWith("error"));
console.log(
  `applications=${N} concurrency=${CONC} ok=${ok} errors=${errors.length} total=${ms}ms avg=${(ms / N).toFixed(1)}ms/件 throughput=${((N / ms) * 1000).toFixed(0)}件/秒`
);
if (errors.length) console.log("sample error:", errors[0]);

// 後片付け
await pool.query("delete from applications where event_id = $1", [eventId]);
await pool.query("delete from events where id = $1", [eventId]);
await pool.query("delete from members where email like '%@loadtest.example.com'");
await pool.end();
