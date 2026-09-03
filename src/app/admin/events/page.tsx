import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import {
  listEvents,
  adminStatusLabel,
  isFinished,
  type EventWithCount,
} from "@/lib/events";
import { formatJst } from "@/lib/format";
import { createEventAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function EventTable({
  events,
  finished,
}: {
  events: EventWithCount[];
  finished: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>イベント名</th>
            <th>日時</th>
            <th>申込</th>
            <th>定員</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>
                <Link href={`/admin/events/${e.id}`}>{e.title}</Link>
              </td>
              <td>{formatJst(e.starts_at)}</td>
              <td>{e.application_count}</td>
              <td>{e.capacity}</td>
              <td>
                {finished ? (
                  <span className="badge finished">✓ 完了</span>
                ) : (
                  <span className="badge neutral">{adminStatusLabel(e)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  await requireAdmin();
  const { error, deleted } = await searchParams;
  const events = await listEvents();
  return (
    <main className="container">
      <h1>イベント</h1>
      {error && <div className="notice error">{error}</div>}
      {deleted && <div className="notice success">イベントを削除しました。</div>}

      <h2>進行中のイベント</h2>
      {events.filter((e) => !isFinished(e)).length === 0 ? (
        <p className="muted">
          進行中のイベントはありません。下のフォームから作成してください。
        </p>
      ) : (
        <EventTable events={events.filter((e) => !isFinished(e))} finished={false} />
      )}

      {events.some(isFinished) && (
        <>
          <h2>終了したイベント</h2>
          <EventTable
            events={events.filter(isFinished).reverse()}
            finished={true}
          />
        </>
      )}

      <h2>新規イベント作成</h2>
      <div className="card">
        <p className="muted">
          作成すると会員向けの申込ページが即座に公開されます。申込は締切日時まで受け付け、
          応募が定員を超えた場合は選定時に抽選になります。
        </p>
        <form action={createEventAction} className="stack">
          <label className="field">
            イベント名
            <input type="text" name="title" required placeholder="ファンミーティング Vol.6" />
          </label>
          <label className="field">
            開催日時
            <input type="datetime-local" name="startsAt" required />
          </label>
          <label className="field">
            会場
            <input type="text" name="venue" required placeholder="渋谷カルチャーホール" />
          </label>
          <label className="field">
            概要(任意)
            <textarea
              name="description"
              rows={4}
              placeholder="イベントの内容・持ち物・注意事項など。会員向けの申込ページと告知文に表示されます"
            />
          </label>
          <label className="field">
            定員(当選者数)
            <input type="number" name="capacity" required min={1} defaultValue={10} />
          </label>
          <label className="field">
            申込締切日時
            <input type="datetime-local" name="closesAt" required />
          </label>
          <button type="submit">イベントを作成する</button>
        </form>
      </div>
    </main>
  );
}
