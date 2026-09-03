-- メールアドレスの重複解消と一意制約(2026-09-03 顧客要望)。
-- 1) 重複しているアドレスは、優先順位(運営者 > 受付 > 会員、古い順、id順)で
--    1件目だけ元のアドレスを残し、2件目以降は「+demoN」付きの別名に変更する。
--    Gmail等のプラス別名(taiyou.stock+demo2@gmail.com)は同じ受信箱に届くため、
--    デモでのメール確認はそのまま可能。
with ranked as (
  select id,
         row_number() over (
           partition by lower(email)
           order by case role when 'admin' then 0 when 'checkin' then 1 else 2 end,
                    created_at, id
         ) as rn
  from members
)
update members m
set email = regexp_replace(m.email, '@', '+demo' || r.rn || '@')
from ranked r
where m.id = r.id and r.rn > 1;

-- 2) 以後、同じメールアドレスのアカウントはDBレベルで作成不可(大小文字は同一視)
create unique index if not exists uq_members_email_lower on members (lower(email));
