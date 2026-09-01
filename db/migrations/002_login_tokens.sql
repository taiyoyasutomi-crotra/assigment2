-- fans_code 認証(メール確認リンク)用のワンタイムトークン
create table if not exists login_tokens (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  display_name text,
  token_hash   text not null unique,  -- 生トークンは保存しない(SHA-256)
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_login_tokens_email on login_tokens(email);
