-- 当選連絡をメール送信からアプリ内通知に変更(2026-09-03 顧客判断)。
-- Resend無料枠(100通/日)の制約を受けないよう、当選・繰上の連絡は
-- マイページの「お知らせ」で行う。メールは認証(ログインリンク等)のみに使う。
-- read_at: 会員がお知らせを開いた日時(null = 未読)
alter table notifications add column if not exists read_at timestamptz;
