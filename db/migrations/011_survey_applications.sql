-- 会員のノーログイン化(2026-09-05 顧客要望)。
-- 申込はアンケート方式(名前・ニックネーム・メールを入力するだけ)にし、
-- 会員アカウント・ログインは廃止(ログインは運営者・受付担当のみ)。
-- 各申込には推測不能なトークンを発行し、申込状況ページ(/a/<token>)で
-- 結果確認・QR表示・キャンセルができる。
alter table applications add column if not exists applicant_name text;
alter table applications add column if not exists nickname text;
alter table applications add column if not exists token text;

-- 既存データの移行: 名前は会員の表示名から引き継ぎ、トークンを採番する
update applications a set applicant_name = m.display_name
  from members m where m.id = a.member_id and a.applicant_name is null;
update applications set applicant_name = '(不明)' where applicant_name is null;
update applications set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where token is null;

alter table applications alter column applicant_name set not null;
alter table applications alter column token set not null;
create unique index if not exists uq_applications_token on applications(token);
alter table applications alter column member_id drop not null;

-- 通知は申込に紐付ける(会員アカウントに依存しない)
alter table notifications add column if not exists application_id uuid references applications(id);
alter table notifications alter column member_id drop not null;
