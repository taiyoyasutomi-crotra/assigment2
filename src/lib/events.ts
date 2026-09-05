import { query, withTransaction } from "@/lib/db";
import { validateEventFields } from "@/lib/eventValidation";

export type EventRow = {
  id: string;
  title: string;
  starts_at: Date;
  venue: string;
  /** 公開用の場所表記(例:「都内某所」)。null = venue をそのまま公開 */
  public_venue: string | null;
  description: string | null;
  capacity: number;
  closes_at: Date;
  /** 終了日時(任意)。過ぎると自動で「完了」扱い。未設定なら手動完了まで開催中 */
  ends_at: Date | null;
  /** 運営者が編集した告知文。null = 自動生成を使う */
  announce_text: string | null;
  /** 運営者が編集した当選連絡の文面({お名前} 等の差し込みタグ入り)。null = 自動生成を使う */
  win_message: string | null;
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

/**
 * 完了したイベントか。一覧の仕分け・表示に使う。
 * - 手動で完了(status = finished)
 * - 終了日時(ends_at)を設定していて、それを過ぎた(自動完了)
 * 終了日時が未設定なら、手動で完了するまで開催中のまま
 */
export function isFinished(e: EventRow): boolean {
  if (e.status === "finished") return true;
  if (e.status === "draft") return false;
  return e.ends_at != null && new Date(e.ends_at) < new Date();
}

/**
 * 会員向けに公開する場所表記。会場の詳細は当選者にだけ知らせる運用のため、
 * 公開用表記(public_venue)があればそちらを出す(告知文・申込ページ用)
 */
export function publicVenueLabel(e: Pick<EventRow, "venue" | "public_venue">): string {
  return e.public_venue?.trim() || e.venue;
}

/** 会員向けの状態表示: 募集中 / 締切 / 終了 */
export function memberStatusLabel(e: EventRow): string {
  if (isFinished(e)) return "終了";
  const s = effectiveStatus(e);
  if (s === "open") return "募集中";
  if (s === "finished") return "終了";
  return "締切";
}

/** 運営者向けの状態表示 */
export function adminStatusLabel(e: EventRow): string {
  if (isFinished(e)) return "終了";
  const s = effectiveStatus(e);
  const labels: Record<string, string> = {
    draft: "下書き",
    open: "募集中",
    closed: "締切(選定前)",
    selected: "選定済み",
    finished: "終了",
  };
  return labels[s];
}

/** イベントを手動で完了にする(一覧の「終了したイベント」へ移る) */
export async function finishEvent(id: string): Promise<void> {
  await query("update events set status = 'finished' where id = $1", [id]);
}

/**
 * 完了したイベントの復元(手動完了の取り消し・終了日時経過による自動完了の解除)。
 * - 手動完了(status=finished)は、選定済みなら selected、未選定なら
 *   締切前は open / 締切後は closed に戻す
 * - 終了日時が過去のままだと即また自動完了になるため、その場合はクリアする
 *   (必要なら復元後に「イベント設定の変更」で改めて設定する)
 */
export async function restoreEvent(id: string): Promise<UpdateEventResult> {
  const e = await getEvent(id);
  if (!e) return { ok: false, error: "イベントが見つかりません" };
  if (!isFinished(e)) return { ok: false, error: "このイベントは完了していません" };

  let newStatus = e.status;
  if (e.status === "finished") {
    const selected = await query(
      `select 1 from applications
       where event_id = $1 and status in ('won', 'waitlisted') limit 1`,
      [id]
    );
    newStatus =
      selected.length > 0
        ? "selected"
        : new Date(e.closes_at) > new Date()
          ? "open"
          : "closed";
  }
  const clearEndsAt = e.ends_at != null && new Date(e.ends_at) <= new Date();
  await query(
    `update events set status = $2 ${clearEndsAt ? ", ends_at = null" : ""} where id = $1`,
    [id, newStatus]
  );
  return { ok: true };
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

/** 募集中/締切中のイベントの開催日時・会場・定員・申込締切・終了日時・概要を変更する */
export async function updateEventSettings(
  id: string,
  input: {
    startsAt: Date;
    venue: string;
    publicVenue: string;
    capacity: number;
    closesAt: Date;
    endsAt: Date | null;
    description: string;
  }
): Promise<UpdateEventResult> {
  const e = await getEvent(id);
  if (!e) return { ok: false, error: "イベントが見つかりません" };
  if (e.status === "selected" || e.status === "finished") {
    return { ok: false, error: "選定後・完了後のイベントは変更できません" };
  }
  const fieldError = (Object.values(validateEventFields(input)) as string[])[0];
  if (fieldError) return { ok: false, error: fieldError };
  // 締切を未来に延ばした場合は募集中に戻す(手動締切していても延長の意図を優先)
  const reopen = input.closesAt > new Date() && e.status === "closed";
  await query(
    `update events set starts_at = $2, venue = $3, public_venue = $4, capacity = $5,
            closes_at = $6, ends_at = $7, description = $8
       ${reopen ? ", status = 'open'" : ""}
     where id = $1`,
    [
      id,
      input.startsAt,
      input.venue.trim(),
      input.publicVenue.trim() || null,
      input.capacity,
      input.closesAt,
      input.endsAt,
      input.description.trim() || null,
    ]
  );
  return { ok: true };
}

/** 告知文の保存。null で自動生成に戻す */
export async function updateAnnounceText(id: string, text: string | null): Promise<void> {
  await query("update events set announce_text = $2 where id = $1", [id, text]);
}

/** 当選連絡の文面の保存。null で自動生成に戻す */
export async function updateWinMessage(id: string, text: string | null): Promise<void> {
  await query("update events set win_message = $2 where id = $1", [id, text]);
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

export async function listEvents(opts?: {
  includeDrafts?: boolean;
}): Promise<EventWithCount[]> {
  return query<EventWithCount>(
    `select e.*, ${COUNT_SQL} as application_count
     from events e ${opts?.includeDrafts ? "" : "where e.status <> 'draft'"}
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
  /** 公開用の場所表記(任意。空なら会場をそのまま公開) */
  publicVenue: string;
  description: string;
  capacity: number;
  closesAt: Date;
  /** 終了日時(任意)。過ぎると自動で完了扱いになる */
  endsAt: Date | null;
  /** true なら下書き(作成中)として保存。会員には公開されない */
  draft?: boolean;
};

function validateEventInput(input: CreateEventInput): string | null {
  const errors = validateEventFields(input);
  return (Object.values(errors) as string[])[0] ?? null;
}

export async function createEvent(
  input: CreateEventInput
): Promise<{ id: string } | { error: string }> {
  const error = validateEventInput(input);
  if (error) return { error };

  const rows = await query<{ id: string }>(
    `insert into events (title, starts_at, venue, public_venue, description, capacity, closes_at, ends_at, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      input.title.trim(),
      input.startsAt,
      input.venue.trim(),
      input.publicVenue.trim() || null,
      input.description.trim() || null,
      input.capacity,
      input.closesAt,
      input.endsAt,
      input.draft ? "draft" : "open",
    ]
  );
  return { id: rows[0].id };
}

/** 下書き(作成中)の全項目を編集する。公開後のイベントには使わない */
export async function updateDraftEvent(
  id: string,
  input: CreateEventInput
): Promise<UpdateEventResult> {
  const e = await getEvent(id);
  if (!e) return { ok: false, error: "イベントが見つかりません" };
  if (e.status !== "draft") {
    return { ok: false, error: "作成中(下書き)のイベントのみ編集できます" };
  }
  const error = validateEventInput(input);
  if (error) return { ok: false, error };
  await query(
    `update events set title = $2, starts_at = $3, venue = $4, public_venue = $5,
            description = $6, capacity = $7, closes_at = $8, ends_at = $9
     where id = $1 and status = 'draft'`,
    [
      id,
      input.title.trim(),
      input.startsAt,
      input.venue.trim(),
      input.publicVenue.trim() || null,
      input.description.trim() || null,
      input.capacity,
      input.closesAt,
      input.endsAt,
    ]
  );
  return { ok: true };
}

/** 下書き(作成中)を公開する。公開した瞬間から会員の申込ページが有効になる */
export async function publishEvent(id: string): Promise<UpdateEventResult> {
  const e = await getEvent(id);
  if (!e) return { ok: false, error: "イベントが見つかりません" };
  if (e.status !== "draft") {
    return { ok: false, error: "すでに公開されています" };
  }
  if (new Date(e.closes_at) <= new Date()) {
    return {
      ok: false,
      error: "申込締切が過去の日時です。締切を編集してから公開してください",
    };
  }
  await query("update events set status = 'open' where id = $1 and status = 'draft'", [
    id,
  ]);
  return { ok: true };
}
