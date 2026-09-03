-- お知らせの削除(会員操作)。行は消さず deleted_at を立てる(ソフト削除):
-- 会員の画面からは消えるが、運営側の通知履歴(配信・既読の記録)には残る。
alter table notifications add column if not exists deleted_at timestamptz;
