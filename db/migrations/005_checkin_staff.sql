-- 受付アカウント(当日スタッフ用)の追加(2026-09-03 顧客要望)。
-- 運営者がイベントごとにメールアドレス+パスワードを払い出し、終了後に削除する。
-- role=checkin は担当イベント(checkin_event_id)の受付画面のみ利用できる弱い権限。
alter table members drop constraint if exists members_role_check;
alter table members
  add constraint members_role_check check (role in ('member', 'admin', 'checkin'));
alter table members add column if not exists checkin_event_id uuid;
alter table members drop constraint if exists fk_members_checkin_event;
alter table members
  add constraint fk_members_checkin_event
  foreign key (checkin_event_id) references events(id);
