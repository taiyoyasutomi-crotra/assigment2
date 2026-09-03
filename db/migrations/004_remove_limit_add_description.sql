-- 申込受付上限(application_limit)の廃止と、イベント概要(description)の追加。
-- 上限は不要な指標となったため削除(2026-09-03 顧客判断)。
-- 以後、申込は締切日時まで無制限に受け付け、応募が定員を超えたら選定時に抽選する。
alter table events drop column if exists application_limit;
alter table events add column if not exists description text;
