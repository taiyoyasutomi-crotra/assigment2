// 管理画面用の一覧クエリ
import { query } from "@/lib/db";

export type AdminApplicationRow = {
  id: string;
  display_name: string;
  nickname: string | null;
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
    `select a.id, a.applicant_name as display_name, a.nickname, a.email,
            a.status, a.waitlist_order, a.applied_at,
            t.id as ticket_id, t.checked_in_at, t.revoked_at
     from applications a
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

/** イベントごとの当選者数と入場済み数(運営者ホームの開催中カード用) */
export type WinnerStats = { won: number; checked_in: number };

export async function listWinnerStats(): Promise<Map<string, WinnerStats>> {
  const rows = await query<{ event_id: string; won: number; checked_in: number }>(
    `select a.event_id, count(*)::int as won,
            count(t.checked_in_at)::int as checked_in
     from applications a
     left join tickets t on t.application_id = a.id and t.revoked_at is null
     where a.status = 'won'
     group by a.event_id`
  );
  return new Map(rows.map((r) => [r.event_id, { won: r.won, checked_in: r.checked_in }]));
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
  read_at: Date | null;
  created_at: Date;
};

export async function listNotificationsForEvent(
  eventId: string
): Promise<AdminNotificationRow[]> {
  return query<AdminNotificationRow>(
    `select n.id, coalesce(a.applicant_name, '(不明)') as display_name,
            n.email, n.kind, n.subject,
            n.status, n.error, n.sent_at, n.read_at, n.created_at
     from notifications n
     left join applications a on a.id = n.application_id
     where n.event_id = $1
     order by n.created_at desc`,
    [eventId]
  );
}
