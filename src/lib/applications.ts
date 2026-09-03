// 申込処理。申込は締切日時(closes_at)まで無制限に受け付ける(受付上限は廃止)。
// イベント行を FOR UPDATE でロックして直列化するため、
// 同時申込でも同一メールの重複エントリーが起きない。
import { withTransaction } from "@/lib/db";
import { query } from "@/lib/db";

export type ApplyResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_found" | "closed" | "already" | "invalid_email" | "duplicate_email";
    };

export async function applyToEvent(
  eventId: string,
  memberId: string,
  email: string
): Promise<ApplyResult> {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "invalid_email" };
  }

  return withTransaction(async (client) => {
    const evRes = await client.query(
      "select * from events where id = $1 for update",
      [eventId]
    );
    const event = evRes.rows[0];
    if (!event) return { ok: false as const, error: "not_found" as const };

    // 締切判定はサーバー側・トランザクション内で行う(画面側のチェックだけでは連打で抜ける)
    if (event.status !== "open") return { ok: false as const, error: "closed" as const };
    if (new Date(event.closes_at) <= new Date()) {
      await client.query("update events set status = 'closed' where id = $1", [eventId]);
      return { ok: false as const, error: "closed" as const };
    }

    const dup = await client.query(
      "select 1 from applications where event_id = $1 and member_id = $2",
      [eventId, memberId]
    );
    if (dup.rows.length > 0) return { ok: false as const, error: "already" as const };

    // 同一イベント内で同じ連絡先メールの申込は不可(別アカウントからの重複エントリー防止)。
    // イベント行ロック内なので同時申込でも重複しない。キャンセル済みは再申込を許す
    const emailDup = await client.query(
      `select 1 from applications
       where event_id = $1 and lower(email) = lower($2) and status <> 'cancelled'`,
      [eventId, trimmed]
    );
    if (emailDup.rows.length > 0) {
      return { ok: false as const, error: "duplicate_email" as const };
    }

    await client.query(
      "insert into applications (event_id, member_id, email) values ($1, $2, $3)",
      [eventId, memberId, trimmed]
    );
    return { ok: true as const };
  });
}

export type MyApplication = {
  id: string;
  event_id: string;
  status: string;
  waitlist_order: number | null;
  applied_at: Date;
  title: string;
  starts_at: Date;
  venue: string;
  event_status: string;
  ticket_id: string | null;
};

export async function listMyApplications(memberId: string): Promise<MyApplication[]> {
  return query<MyApplication>(
    `select a.id, a.event_id, a.status, a.waitlist_order, a.applied_at,
            e.title, e.starts_at, e.venue, e.status as event_status,
            t.id as ticket_id
     from applications a
     join events e on e.id = a.event_id
     left join tickets t on t.application_id = a.id and t.revoked_at is null
     where a.member_id = $1
     order by e.starts_at asc`,
    [memberId]
  );
}

export async function getMyApplicationForEvent(eventId: string, memberId: string) {
  const rows = await query<{ id: string; status: string }>(
    "select id, status from applications where event_id = $1 and member_id = $2",
    [eventId, memberId]
  );
  return rows[0] ?? null;
}

/**
 * 名簿外申込の承認: 申込のメールアドレスを会員名簿に追加し、
 * 選定対象・申込数のカウントに含める。
 * ※次に名簿CSVを取り込み直す(洗い替え)と消えるため、正式には次回CSVに反映してもらう
 */
export async function approveApplicationEmail(applicationId: string): Promise<void> {
  await query(
    `insert into member_allowlist (email, display_name)
     select lower(a.email), m.display_name
       from applications a join members m on m.id = a.member_id
      where a.id = $1
     on conflict (email) do nothing`,
    [applicationId]
  );
}

/** 申込の削除(名簿外申込の整理用)。チケットがあれば一緒に消す */
export async function deleteApplication(applicationId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("delete from tickets where application_id = $1", [applicationId]);
    await client.query("delete from applications where id = $1", [applicationId]);
  });
}
