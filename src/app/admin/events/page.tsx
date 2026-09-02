import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { listEvents, adminStatusLabel, isLottery } from "@/lib/events";
import { formatJst } from "@/lib/format";
import { createEventAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;
  const events = await listEvents();
  return (
    <main className="container">
      <h1>
        イベント管理{" "}
        <Link href="/admin/settings" style={{ fontSize: "0.9rem", fontWeight: 400 }}>
          認証設定
        </Link>
      </h1>
      {error && <div className="notice error">{error}</div>}

      <h2>イベント一覧</h2>
      {events.length === 0 ? (
        <p className="muted">イベントはまだありません。下のフォームから作成してください。</p>
      ) : (
        <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>イベント名</th>
              <th>日時</th>
              <th>方式</th>
              <th>申込</th>
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
                <td>{isLottery(e) ? "抽選" : "先着"}</td>
                <td>
                  {e.application_count} / {e.application_limit}
                </td>
                <td>
                  <span className="badge neutral">{adminStatusLabel(e)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <h2>新規イベント作成</h2>
      <div className="card">
        <p className="muted">
          作成すると会員向けの申込ページが即座に公開されます。申込上限=定員で先着順、
          申込上限&gt;定員で抽選になります。
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
            定員(当選者数)
            <input type="number" name="capacity" required min={1} defaultValue={10} />
          </label>
          <label className="field">
            申込受付上限
            <input type="number" name="applicationLimit" required min={1} defaultValue={20} />
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
