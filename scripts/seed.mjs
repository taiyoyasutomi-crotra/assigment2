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
  // SEED_DEMO_EMAIL を設定すると、1人目はそのアドレス、2人目以降は
  // プラス別名(taiyou.stock+m2@gmail.com 等)になる。Gmail等では同じ受信箱に
  // 届くため実メールのデモが可能で、かつメールアドレスは重複しない
  // (members にはメールの一意制約があるため、同一アドレスの相乗りは不可)。
  // 未設定ならダミー(example.com)。
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
  ].map(([name, email], i) => [
    name,
    demoEmail ? (i === 0 ? demoEmail : demoEmail.replace("@", `+m${i + 1}@`)) : email,
  ]);
  const memberIds = [];
  for (const [name, email] of memberNames) {
    const r = await client.query(
      "insert into members (display_name, email) values ($1, $2) returning id",
      [name, email]
    );
    memberIds.push(r.rows[0].id);
  }

  // イベント1: 定員5に対して申込8件入り → 選定時に抽選になる。
  const ev1 = await client.query(
    `insert into events (title, starts_at, venue, description, capacity, closes_at, status)
     values ('ファンミーティング Vol.5', now() + interval '14 days', '渋谷カルチャーホール',
             'メンバーと直接お話しできる年に一度のファンミーティングです。トークショー・撮影会・お土産付き。',
             5, now() + interval '7 days', 'open')
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

  // イベント2: 定員10に対して申込3件 → 全員当選。手動締切デモ用(デモシナリオ#3)。
  const ev2 = await client.query(
    `insert into events (title, starts_at, venue, description, capacity, closes_at, status)
     values ('グッズ交換会', now() + interval '21 days', 'コミュニティスペース青山',
             '会員同士でグッズを持ち寄って交換する交流イベントです。交換したいグッズをご持参ください。',
             10, now() + interval '10 days', 'open')
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
  console.log("  イベント: ファンミーティング Vol.5(定員5・申込8件 → 抽選)");
  console.log("            グッズ交換会(定員10・申込3件 → 全員当選)");
} catch (e) {
  await client.query("rollback");
  throw e;
} finally {
  await client.end();
}
