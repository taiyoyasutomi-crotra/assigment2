-- 送信プロバイダの記録(2026-09-05)。
-- 無料枠で1日200通以上を送るため Resend + Brevo を併用する。
-- どのプロバイダで送ったかを記録し、プロバイダごとの1日予算の消費を数える
alter table notifications add column if not exists provider text;
