-- 運営者が管理画面から変更できる設定(参加コード等)
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Fans' の会員名簿(CSVエクスポート)から取り込む許可リスト。
-- 空の場合は参加コードのみで判定(取り込みは任意の強化オプション)
create table if not exists member_allowlist (
  email        text primary key,   -- 小文字で保存
  display_name text,
  imported_at  timestamptz not null default now()
);
