// チケット発行と QR 受付照合(F6)。
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "@/lib/db";

/** 推測不能なトークンでチケットを発行する(選定・繰上の両方から使う) */
export async function issueTicket(
  client: PoolClient,
  applicationId: string
): Promise<{ id: string; token: string }> {
  const token = randomBytes(24).toString("base64url");
  const res = await client.query(
    "insert into tickets (application_id, token) values ($1, $2) returning id",
    [applicationId, token]
  );
  return { id: res.rows[0].id, token };
}

export type TicketView = {
  id: string;
  token: string;
  checked_in_at: Date | null;
  revoked_at: Date | null;
  display_name: string;
  title: string;
  starts_at: Date;
  venue: string;
  application_status: string;
};

/** 本人のチケットのみ返す(他人のチケット URL を叩いても見えない) */
export async function getMyTicket(
  ticketId: string,
  memberId: string
): Promise<TicketView | null> {
  const rows = await query<TicketView>(
    `select t.id, t.token, t.checked_in_at, t.revoked_at,
            m.display_name, e.title, e.starts_at, e.venue,
            a.status as application_status
     from tickets t
     join applications a on a.id = t.application_id
     join members m on m.id = a.member_id
     join events e on e.id = a.event_id
     where t.id = $1 and a.member_id = $2`,
    [ticketId, memberId]
  );
  return rows[0] ?? null;
}

export type CheckinResult =
  | { ok: true; displayName: string }
  | {
      ok: false;
      reason: "invalid" | "wrong_event" | "cancelled" | "already";
      message: string;
      displayName?: string;
      checkedInAt?: string;
    };

/** QR トークンを照合して入場処理を行う。判定はすべてサーバー側 */
export async function checkinByToken(
  eventId: string,
  token: string
): Promise<CheckinResult> {
  const rows = await query<{
    id: string;
    checked_in_at: Date | null;
    revoked_at: Date | null;
    event_id: string;
    app_status: string;
    display_name: string;
  }>(
    `select t.id, t.checked_in_at, t.revoked_at, a.event_id,
            a.status as app_status, m.display_name
     from tickets t
     join applications a on a.id = t.application_id
     join members m on m.id = a.member_id
     where t.token = $1`,
    [token]
  );
  const t = rows[0];
  if (!t) {
    return { ok: false, reason: "invalid", message: "無効なチケットです" };
  }
  if (t.event_id !== eventId) {
    return {
      ok: false,
      reason: "wrong_event",
      message: "別のイベントのチケットです",
      displayName: t.display_name,
    };
  }
  if (t.revoked_at || t.app_status === "cancelled") {
    return {
      ok: false,
      reason: "cancelled",
      message: "キャンセル済みのチケットです",
      displayName: t.display_name,
    };
  }

  // 二重入場防止: checked_in_at が NULL のときだけ更新できる(原子的)
  const claimed = await query<{ checked_in_at: Date }>(
    `update tickets set checked_in_at = now()
     where id = $1 and checked_in_at is null
     returning checked_in_at`,
    [t.id]
  );
  if (claimed.length === 0) {
    return {
      ok: false,
      reason: "already",
      message: "入場済みです",
      displayName: t.display_name,
      checkedInAt: t.checked_in_at ? new Date(t.checked_in_at).toISOString() : undefined,
    };
  }
  return { ok: true, displayName: t.display_name };
}

export type WinnerRow = {
  application_id: string;
  display_name: string;
  token: string | null;
  checked_in_at: Date | null;
  revoked_at: Date | null;
};

/** 受付ボード用: 当選者の全一覧(入場状態つき) */
export async function listWinners(eventId: string): Promise<WinnerRow[]> {
  return query<WinnerRow>(
    `select a.id as application_id, m.display_name, t.token, t.checked_in_at, t.revoked_at
     from applications a
     join members m on m.id = a.member_id
     left join tickets t on t.application_id = a.id
     where a.event_id = $1 and a.status = 'won'
     order by m.display_name`,
    [eventId]
  );
}

export type ManualCheckinResult = { ok: true } | { ok: false; error: string };

/**
 * 受付ボードからの手動操作。checkedIn=true で入場、false で入場取消。
 * 対象イベントの有効な当選チケットに限定して更新する
 */
export async function setCheckedIn(
  eventId: string,
  applicationId: string,
  checkedIn: boolean
): Promise<ManualCheckinResult> {
  const rows = await query<{ id: string }>(
    `update tickets t set checked_in_at = ${checkedIn ? "now()" : "null"}
     from applications a
     where t.application_id = a.id
       and a.id = $1 and a.event_id = $2
       and a.status = 'won' and t.revoked_at is null
       and t.checked_in_at is ${checkedIn ? "null" : "not null"}
     returning t.id`,
    [applicationId, eventId]
  );
  if (!rows[0]) {
    return { ok: false, error: "対象のチケットを更新できませんでした(画面を更新してください)" };
  }
  return { ok: true };
}
