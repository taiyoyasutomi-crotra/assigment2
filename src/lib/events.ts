import { query, withTransaction } from "@/lib/db";

export type EventRow = {
  id: string;
  title: string;
  starts_at: Date;
  venue: string;
  description: string | null;
  capacity: number;
  closes_at: Date;
  status: "draft" | "open" | "closed" | "selected" | "finished";
};

export type EventWithCount = EventRow & { application_count: number };

/**
 * 表示・判定用の実効ステータス。
 * closes_at を過ぎた open イベントは closed として扱う
 * (DB の status 更新は申込・選定などの書き込み時に行う)。
 */
export function effectiveStatus(e: EventRow): EventRow["status"] {
  if (e.status === "open" && new Date(e.closes_at) <= new Date()) return "closed";
  return e.status;
}

/** 会員向けの状態表示: 募集中 / 締切 / 終了 */
export function memberStatusLabel(e: EventRow): string {
  if (e.status !== "draft" && new Date(e.starts_at) < new Date()) return "終了";
  const s = effectiveStatus(e);
  if (s === "open") return "募集中";
  if (s === "finished") return "終了";
  return "締切";
}

/** 運営者向けの状態表示 */
export function adminStatusLabel(e: EventRow): string {
  const s = effectiveStatus(e);
  const labels: Record<string, string> = {
    draft: "下書き",
    open: "募集中",
    closed: "締切(選定前)",
    selected: "選定済み",
    finished: "終了",
  };
  if (s !== "draft" && s !== "open" && new Date(e.starts_at) < new Date()) {
    return "終了";
  }
  return labels[s];
}

/** 完了したイベントか(開催日時を過ぎた、または明示的に終了)。一覧の仕分けに使う */
export function isFinished(e: EventRow): boolean {
  if (e.status === "finished") return true;
  return e.status !== "draft" && new Date(e.starts_at) < new Date();
}

/** イベントを手動で完了にする(一覧の「終了したイベント」へ移る) */
export async function finishEvent(id: string): Promise<void> {
  await query("update events set status = 'finished' where id = $1", [id]);
}

/** イベントを削除する(申込・チケット・通知履歴・受付アカウントも一緒に消える。取り消し不可) */
export async function deleteEvent(id: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      "delete from members where role = 'checkin' and checkin_event_id = $1",
      [id]
    );
    await client.query("delete from notifications where event_id = $1", [id]);
    await client.query(
      `delete from tickets where application_id in
       (select id from applications where event_id = $1)`,
      [id]
    );
    await client.query("delete from applications where event_id = $1", [id]);
    await client.query("delete from events where id = $1", [id]);
  });
}

export type UpdateEventResult = { ok: true } | { ok: false; error: string };

/** 募集中/締切中のイベントの定員(当選人数)・申込締切・概要を変更する */
export async function updateEventSettings(
  id: string,
  input: { capacity: number; closesAt: Date; description: string }
): Promise<UpdateEventResult> {
  const e = await getEvent(id);
  if (!e) return { ok: false, error: "イベントが見つかりません" };
  if (e.status === "selected" || e.status === "finished") {
    return { ok: false, error: "選定後・完了後のイベントは変更できません" };
  }
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
    return { ok: false, error: "定員は1以上の整数で入力してください" };
  }
  if (isNaN(input.closesAt.getTime())) {
    return { ok: false, error: "日時の形式が不正です" };
  }
  if (input.closesAt >= new Date(e.starts_at)) {
    return { ok: false, error: "申込締切はイベント開始より前にしてください" };
  }
  // 締切を未来に延ばした場合は募集中に戻す(手動締切していても延長の意図を優先)
  const reopen = input.closesAt > new Date() && e.status === "closed";
  await query(
    `update events set capacity = $2, closes_at = $3, description = $4
       ${reopen ? ", status = 'open'" : ""}
     where id = $1`,
    [id, input.capacity, input.closesAt, input.description.trim() || null]
  );
  return { ok: true };
}

// 申込数のカウント: キャンセル済みは数えない。名簿を取込済みの場合、
// 名簿外の申込も数えない(選定対象外のため。承認すると名簿入りしてカウントされる)
const COUNT_SQL = `(
  select count(*)::int from applications a
  where a.event_id = e.id and a.status <> 'cancelled'
    and (
      not exists (select 1 from member_allowlist)
      or exists (select 1 from member_allowlist al where al.email = lower(a.email))
    )
)`;

export async function listEvents(): Promise<EventWithCount[]> {
  return query<EventWithCount>(
    `select e.*, ${COUNT_SQL} as application_count
     from events e where e.status <> 'draft'
     order by e.starts_at asc`
  );
}

export async function getEvent(id: string): Promise<EventWithCount | null> {
  const rows = await query<EventWithCount>(
    `select e.*, ${COUNT_SQL} as application_count from events e where e.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export type CreateEventInput = {
  title: string;
  startsAt: Date;
  venue: string;
  description: string;
  capacity: number;
  closesAt: Date;
};

export async function createEvent(
  input: CreateEventInput
): Promise<{ id: string } | { error: string }> {
  if (!input.title.trim()) return { error: "イベント名を入力してください" };
  if (!input.venue.trim()) return { error: "会場を入力してください" };
  if (!Number.isInteger(input.capacity) || input.capacity <= 0)
    return { error: "定員は1以上の整数で入力してください" };
  if (isNaN(input.startsAt.getTime()) || isNaN(input.closesAt.getTime()))
    return { error: "日時の形式が不正です" };
  if (input.closesAt >= input.startsAt)
    return { error: "申込締切はイベント開始より前にしてください" };

  const rows = await query<{ id: string }>(
    `insert into events (title, starts_at, venue, description, capacity, closes_at, status)
     values ($1, $2, $3, $4, $5, $6, 'open') returning id`,
    [input.title.trim(), input.startsAt, input.venue.trim(), input.description.trim() || null, input.capacity, input.closesAt]
  );
  return { id: rows[0].id };
}
