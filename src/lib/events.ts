import { query } from "@/lib/db";

export type EventRow = {
  id: string;
  title: string;
  starts_at: Date;
  venue: string;
  capacity: number;
  application_limit: number;
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

export function isLottery(e: EventRow): boolean {
  return e.application_limit > e.capacity; // TODO(hearing:Q3) 先着か抽選か
}

/** 完了したイベントか(開催日時を過ぎた、または明示的に終了)。一覧の仕分けに使う */
export function isFinished(e: EventRow): boolean {
  if (e.status === "finished") return true;
  return e.status !== "draft" && new Date(e.starts_at) < new Date();
}

const COUNT_SQL = `(
  select count(*)::int from applications a
  where a.event_id = e.id and a.status <> 'cancelled'
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
  capacity: number;
  applicationLimit: number;
  closesAt: Date;
};

export async function createEvent(
  input: CreateEventInput
): Promise<{ id: string } | { error: string }> {
  if (!input.title.trim()) return { error: "イベント名を入力してください" };
  if (!input.venue.trim()) return { error: "会場を入力してください" };
  if (!Number.isInteger(input.capacity) || input.capacity <= 0)
    return { error: "定員は1以上の整数で入力してください" };
  if (!Number.isInteger(input.applicationLimit) || input.applicationLimit < input.capacity)
    return { error: "申込上限は定員以上で入力してください" };
  if (isNaN(input.startsAt.getTime()) || isNaN(input.closesAt.getTime()))
    return { error: "日時の形式が不正です" };
  if (input.closesAt >= input.startsAt)
    return { error: "申込締切はイベント開始より前にしてください" };

  const rows = await query<{ id: string }>(
    `insert into events (title, starts_at, venue, capacity, application_limit, closes_at, status)
     values ($1, $2, $3, $4, $5, $6, 'open') returning id`,
    [input.title.trim(), input.startsAt, input.venue.trim(), input.capacity, input.applicationLimit, input.closesAt]
  );
  return { id: rows[0].id };
}
