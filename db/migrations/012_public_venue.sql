-- 公開用の場所表記(2026-09-05 顧客要望)。
-- 会場の詳細は当選者にだけ知らせる運用(例:「都内某所」)のため、
-- 告知文・申込ページ・当選前の申込状況ページに出す表記を別に持てるようにする。
-- null = 会場(venue)をそのまま公開する
alter table events add column if not exists public_venue text;
