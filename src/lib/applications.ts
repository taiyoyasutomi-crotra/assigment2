// 申込処理。ログイン不要のアンケート方式(2026-09-05 顧客要望):
// 名前・ニックネーム・メールアドレスを入力するだけで申込できる。
// 申込ごとに推測不能なトークンを発行し、申込状況ページ(/a/<token>)で
// 結果確認・QR表示・キャンセルができる。
// 申込は締切日時(closes_at)まで無制限に受け付ける。
// イベント行を FOR UPDATE でロックして直列化するため、
// 同時申込でも同一メールの重複エントリーが起きない。
import { randomBytes } from "node:crypto";
import { withTransaction } from "@/lib/db";
import { query } from "@/lib/db";

export type ApplyResult =
  | { ok: true; token: string }
  | {
      ok: false;
      error:
        | "not_found"
        | "closed"
        | "invalid_name"
        | "invalid_email"
        | "duplicate_email";
    };

export async function applyToEvent(
  eventId: string,
  input: { name: string; nickname: string; email: string }
): Promise<ApplyResult> {
  const name = input.name.trim();
  const nickname = input.nickname.trim();
  const email = input.email.trim();
  if (!name) return { ok: false, error: "invalid_name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

    // 同一イベント内で同じメールアドレスの申込は不可(重複エントリー防止)。
    // イベント行ロック内なので同時申込でも重複しない。キャンセル済みは再申込を許す
    const emailDup = await client.query(
      `select 1 from applications
       where event_id = $1 and lower(email) = lower($2) and status <> 'cancelled'`,
      [eventId, email]
    );
    if (emailDup.rows.length > 0) {
      return { ok: false as const, error: "duplicate_email" as const };
    }

    const token = randomBytes(24).toString("base64url");
    await client.query(
      `insert into applications (event_id, applicant_name, nickname, email, token)
       values ($1, $2, $3, $4, $5)`,
      [eventId, name, nickname || null, email, token]
    );
    return { ok: true as const, token };
  });
}

/** 申込状況ページ(/a/<token>)用。トークンが一致する申込だけを返す */
export type ApplicationStatusView = {
  id: string;
  status: string;
  waitlist_order: number | null;
  applicant_name: string;
  nickname: string | null;
  email: string;
  applied_at: Date;
  event_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date | null;
  venue: string;
  closes_at: Date;
  event_status: string;
  ticket_id: string | null;
  ticket_token: string | null;
  checked_in_at: Date | null;
};

export async function getApplicationByToken(
  token: string
): Promise<ApplicationStatusView | null> {
  const rows = await query<ApplicationStatusView>(
    `select a.id, a.status, a.waitlist_order, a.applicant_name, a.nickname,
            a.email, a.applied_at, a.event_id,
            e.title, e.starts_at, e.ends_at, e.venue, e.closes_at,
            e.status as event_status,
            t.id as ticket_id, t.token as ticket_token, t.checked_in_at
     from applications a
     join events e on e.id = a.event_id
     left join tickets t on t.application_id = a.id and t.revoked_at is null
     where a.token = $1`,
    [token]
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
     select lower(a.email), coalesce(a.nickname, a.applicant_name)
       from applications a
      where a.id = $1
     on conflict (email) do nothing`,
    [applicationId]
  );
}

/** 申込の削除(名簿外申込の整理用)。チケット・通知履歴があれば一緒に消す */
export async function deleteApplication(applicationId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("delete from notifications where application_id = $1", [
      applicationId,
    ]);
    await client.query("delete from tickets where application_id = $1", [applicationId]);
    await client.query("delete from applications where id = $1", [applicationId]);
  });
}
