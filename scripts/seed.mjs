// デモ用シードデータを投入する。
// 「会員10名+運営者1名、イベント2件、申込8件」の状態を作る(受け入れ条件・全体)。
// 使い方: npm run db:seed(先に npm run db:setup でスキーマを適用しておく)
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
await client.connect();

try {
  await client.query("begin");
  await client.query(
    "truncate notifications, tickets, applications, events, members cascade"
  );

  // 運営者1名
  const adminRes = await client.query(
    `insert into members (display_name, email, role) values
     ('運営 太郎', 'admin@example.com', 'admin') returning id`
  );

  // 会員10名。
  // SEED_DEMO_EMAIL を設定すると全会員のメールがそのアドレスになる。
  // Resend の無料枠(onboarding@resend.dev 送信)はアカウントオーナー宛にしか
  // 送れないため、実メールを見せるデモでは SEED_DEMO_EMAIL=<オーナーのアドレス> で
  // シードする。未設定ならダミー(example.com)。
  const demoEmail = process.env.SEED_DEMO_EMAIL;
  const memberNames = [
    ["佐藤 花子", "hanako.sato@example.com"],
    ["鈴木 一郎", "ichiro.suzuki@example.com"],
    ["高橋 美咲", "misaki.takahashi@example.com"],
    ["田中 健太", "kenta.tanaka@example.com"],
    ["伊藤 さくら", "sakura.ito@example.com"],
    ["渡辺 大輔", "daisuke.watanabe@example.com"],
    ["山本 結衣", "yui.yamamoto@example.com"],
    ["中村 翔太", "shota.nakamura@example.com"],
    ["小林 愛", "ai.kobayashi@example.com"],
    ["加藤 拓海", "takumi.kato@example.com"],
  ].map(([name, email]) => [name, demoEmail || email]);
  const memberIds = [];
  for (const [name, email] of memberNames) {
    const r = await client.query(
      "insert into members (display_name, email) values ($1, $2) returning id",
      [name, email]
    );
    memberIds.push(r.rows[0].id);
  }

  // イベント1: 抽選型(capacity < application_limit)。申込8件入り。
  // 上限10なので、あと2名が申し込むと自動締切になる(デモシナリオ#3)。
  const ev1 = await client.query(
    `insert into events (title, starts_at, venue, capacity, application_limit, closes_at, status)
     values ('ファンミーティング Vol.5', now() + interval '14 days', '渋谷カルチャーホール',
             5, 10, now() + interval '7 days', 'open')
     returning id`
  );
  const event1 = ev1.rows[0].id;
  for (let i = 0; i < 8; i++) {
    const r = await client.query(
      "select email from members where id = $1",
      [memberIds[i]]
    );
    await client.query(
      `insert into applications (event_id, member_id, email, applied_at)
       values ($1, $2, $3, now() - interval '1 hour' * $4)`,
      [event1, memberIds[i], r.rows[0].email, 8 - i]
    );
  }

  // イベント2: 先着型(capacity = application_limit)。手動締切デモ用(デモシナリオ#3)。
  const ev2 = await client.query(
    `insert into events (title, starts_at, venue, capacity, application_limit, closes_at, status)
     values ('グッズ交換会', now() + interval '21 days', 'コミュニティスペース青山',
             10, 10, now() + interval '10 days', 'open')
     returning id`
  );
  const event2 = ev2.rows[0].id;
  for (let i = 0; i < 3; i++) {
    const r = await client.query("select email from members where id = $1", [
      memberIds[i],
    ]);
    await client.query(
      `insert into applications (event_id, member_id, email) values ($1, $2, $3)`,
      [event2, memberIds[i], r.rows[0].email]
    );
  }

  await client.query("commit");
  console.log("シード完了:");
  console.log("  運営者: 運営 太郎 (admin@example.com)");
  console.log("  会員: 10名");
  console.log("  イベント: ファンミーティング Vol.5(抽選・申込8/10件)");
  console.log("            グッズ交換会(先着・申込3/10件)");
} catch (e) {
  await client.query("rollback");
  throw e;
} finally {
  await client.end();
}
