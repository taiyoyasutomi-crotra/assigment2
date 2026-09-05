// アプリの更新に必要なDB変更(マイグレーション)を、管理画面から適用するための仕組み。
// デプロイとDB更新のタイミングずれで画面がエラーになるのを防ぐ:
// 未適用の変更があると管理画面にバナーが出て、ボタン1つで適用できる。
// すべて冪等(何度実行しても安全)な文だけを置くこと。
import { query, withTransaction } from "@/lib/db";

/** 期待するカラムの一覧。存在しなければ未適用の更新がある */
const REQUIRED_COLUMNS: [table: string, column: string][] = [
  ["applications", "token"], // 011 会員ノーログイン化
  ["notifications", "application_id"], // 011
  ["events", "public_venue"], // 012 公開用の場所表記
  ["events", "cancel_deadline"], // 013 キャンセル受付期限
  ["notifications", "provider"], // 014 送信プロバイダ記録
];

/** 未適用のDB変更があるか(管理画面のバナー表示用) */
export async function hasPendingDbUpdates(): Promise<boolean> {
  const rows = await query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and (table_name, column_name) in (
         ${REQUIRED_COLUMNS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ")}
       )`,
    REQUIRED_COLUMNS.flat()
  );
  return rows.length < REQUIRED_COLUMNS.length;
}

/**
 * 未適用のDB変更をまとめて適用する(db/migrations/011〜014 と同じ内容)。
 * if not exists 等で冪等にしてあるため、適用済みの環境で実行しても安全
 */
export async function applyDbUpdates(): Promise<void> {
  const statements = [
    // 011: 会員ノーログイン化(アンケート方式の申込)
    `alter table applications add column if not exists applicant_name text`,
    `alter table applications add column if not exists nickname text`,
    `alter table applications add column if not exists token text`,
    `update applications a set applicant_name = m.display_name
       from members m where m.id = a.member_id and a.applicant_name is null`,
    `update applications set applicant_name = '(不明)' where applicant_name is null`,
    `update applications set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
       where token is null`,
    `alter table applications alter column applicant_name set not null`,
    `alter table applications alter column token set not null`,
    `create unique index if not exists uq_applications_token on applications(token)`,
    `alter table applications alter column member_id drop not null`,
    `alter table notifications add column if not exists application_id uuid references applications(id)`,
    `alter table notifications alter column member_id drop not null`,
    // 012: 公開用の場所表記
    `alter table events add column if not exists public_venue text`,
    // 013: キャンセル受付期限
    `alter table events add column if not exists cancel_deadline timestamptz`,
    // 014: 送信プロバイダ記録
    `alter table notifications add column if not exists provider text`,
  ];
  await withTransaction(async (client) => {
    for (const sql of statements) {
      await client.query(sql);
    }
  });
}
