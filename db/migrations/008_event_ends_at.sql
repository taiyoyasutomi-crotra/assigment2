-- イベント終了日時の追加(2026-09-03 顧客要望)。
-- ends_at を設定すると、その日時を過ぎたイベントは自動で「完了」扱いになる。
-- 未設定なら手動で「完了」にするまで開催中のまま(従来の「開催日時経過で自動終了」は廃止)。
alter table events add column if not exists ends_at timestamptz;
alter table events drop constraint if exists events_ends_after_starts;
alter table events
  add constraint events_ends_after_starts
  check (ends_at is null or ends_at > starts_at);
