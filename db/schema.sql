-- ファンミーティング参加受付システム スキーマ
-- 仕様: docs/mock-instructions.md 6章

drop table if exists member_allowlist cascade;
drop table if exists app_settings cascade;
drop table if exists login_tokens cascade;
drop table if exists notifications cascade;
drop table if exists tickets cascade;
drop table if exists applications cascade;
drop table if exists events cascade;
drop table if exists members cascade;

create table members (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  email         text not null,
  -- モック差分: 運営者ロール。本実装ではコミュニティ基盤の権限に差し替え
  -- checkin = 受付担当(当日スタッフ)。担当イベントの受付画面のみ利用可
  -- TODO(hearing:Q1)
  role          text not null default 'member' check (role in ('member', 'admin', 'checkin')),
  is_active     boolean not null default true,  -- TODO(hearing:Q2) 会員資格の検証方法
  password_hash text,  -- scrypt。null = 未設定(メールリンクでのみログイン可)
  -- role=checkin の担当イベント(FK は events 作成後に付与)
  checkin_event_id uuid,
  created_at    timestamptz not null default now()
);

create table events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  starts_at   timestamptz not null,
  venue       text not null,
  description text,  -- イベント概要(任意)。申込ページ・告知文に表示
  capacity    int not null check (capacity > 0),
  closes_at   timestamptz not null,
  status      text not null default 'open'
              check (status in ('draft', 'open', 'closed', 'selected', 'finished')),
  created_at  timestamptz not null default now()
  -- 申込は締切(closes_at)まで無制限に受付。応募 > capacity なら選定時に抽選
);

alter table members
  add constraint fk_members_checkin_event
  foreign key (checkin_event_id) references events(id);

create table applications (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id),
  member_id      uuid not null references members(id),
  -- 申込フォームで入力されたメールアドレス。通知の送信先はこれを使う
  email          text not null,
  status         text not null default 'applied'
                 check (status in ('applied', 'won', 'waitlisted', 'lost', 'cancelled')),
  waitlist_order int,
  applied_at     timestamptz not null default now(),
  unique (event_id, member_id)  -- 1人1枚 TODO(hearing:Q9)
);

create table tickets (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references applications(id),
  -- 推測不能なランダムトークン(crypto.randomBytes)。連番・UUIDv1 不可
  token          text not null unique,
  checked_in_at  timestamptz,
  revoked_at     timestamptz,  -- キャンセルによる無効化
  created_at     timestamptz not null default now()
);

-- 当選・繰上のお知らせ(アプリ内通知)。
-- メールでは送らない(無料枠の制約と運用方針)。email は宛先の記録として残す
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id),
  event_id   uuid not null references events(id),
  kind       text not null,  -- selection_won | promotion_won
  email      text not null,
  subject    text not null,
  body       text not null,
  status     text not null default 'sent' check (status in ('pending', 'sent', 'failed')),
  error      text,
  sent_at    timestamptz,
  read_at    timestamptz,  -- 会員がお知らせを開いた日時(null = 未読)
  created_at timestamptz not null default now()
);

-- fans_code 認証(メール確認リンク)用のワンタイムトークン
create table login_tokens (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  display_name  text,
  password_hash text,  -- アカウント作成時のパスワード(確認リンクを開いた時点で会員に設定)
  purpose       text not null default 'login'
                check (purpose in ('login', 'signup', 'reset')),  -- reset はパスワード再設定専用
  token_hash    text not null unique,  -- 生トークンは保存しない(SHA-256)
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_login_tokens_email on login_tokens(email);

-- 運営者が管理画面から変更できる設定(参加コード等)
create table app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Fans' の会員名簿(CSVエクスポート)から取り込む許可リスト。
-- 空の場合は参加コードのみで判定(取り込みは任意の強化オプション)
create table member_allowlist (
  email        text primary key,   -- 小文字で保存
  display_name text,
  imported_at  timestamptz not null default now()
);

create index idx_applications_event on applications(event_id);
create index idx_applications_member on applications(member_id);
create index idx_notifications_event on notifications(event_id);
