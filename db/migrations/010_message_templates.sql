-- 告知文・当選連絡の文面を運営者が編集できるようにする(2026-09-04 顧客テンプレ反映)。
-- null = 自動生成の文面を使う。保存するとイベント設定を変えても文面は変わらない
alter table events add column if not exists announce_text text;
alter table events add column if not exists win_message  text;
