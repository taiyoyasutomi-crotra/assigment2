// 管理画面用の一覧クエリ
import { query } from "@/lib/db";

export type AdminApplicationRow = {
  id: string;
  display_name: string;
  email: string;
  status: string;
  waitlist_order: number | null;
  applied_at: Date;
  ticket_id: string | null;
  checked_in_at: Date | null;
  revoked_at: Date | null;
};

export async function listApplicationsForEvent(
  eventId: string
): Promise<AdminApplicationRow[]> {
  return query<AdminApplicationRow>(
    `select a.id, m.display_name, a.email, a.status, a.waitlist_order, a.applied_at,
            t.id as ticket_id, t.checked_in_at, t.revoked_at
     from applications a
     join members m on m.id = a.member_id
     left join tickets t on t.application_id = a.id
     where a.event_id = $1
     order by
       case a.status when 'won' then 0 when 'waitlisted' then 1
                     when 'applied' then 2 when 'cancelled' then 3 else 4 end,
       a.waitlist_order nulls first,
       a.applied_at asc`,
    [eventId]
  );
}

export type AdminNotificationRow = {
  id: string;
  display_name: string;
  email: string;
  kind: string;
  subject: string;
  status: string;
  error: string | null;
  sent_at: Date | null;
  created_at: Date;
};

export async function listNotificationsForEvent(
  eventId: string
): Promise<AdminNotificationRow[]> {
  return query<AdminNotificationRow>(
    `select n.id, m.display_name, n.email, n.kind, n.subject,
            n.status, n.error, n.sent_at, n.created_at
     from notifications n
     join members m on m.id = n.member_id
     where n.event_id = $1
     order by n.created_at desc`,
    [eventId]
  );
}
