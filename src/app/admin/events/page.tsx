import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import {
  listEvents,
  adminStatusLabel,
  effectiveStatus,
  isFinished,
  type EventWithCount,
} from "@/lib/events";
import { formatJst } from "@/lib/format";
import { createEventAction } from "@/app/admin/actions";
import { SidebarNav } from "@/components/SidebarNav";

export const dynamic = "force-dynamic";

type Tab = "draft" | "open" | "active" | "finished" | "new";

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
  searchParams: Promise<{
    tab?: string;
    error?: string;
    deleted?: string;
    saved?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = (["draft", "open", "active", "finished", "new"] as const).includes(
    sp.tab as Tab
  )
    ? (sp.tab as Tab)
    : "open";

  const events = await listEvents({ includeDrafts: true });
  // 仕分け: 作成中(下書き) / 募集中(締切前) / 開催中(締切後〜開催まで。当日受付を含む) / 終了
  const drafts = events.filter((e) => e.status === "draft");
  const open = events.filter(
    (e) => !isFinished(e) && e.status !== "draft" && effectiveStatus(e) === "open"
  );
  const active = events.filter(
    (e) => !isFinished(e) && e.status !== "draft" && effectiveStatus(e) !== "open"
  );
  const finished = events.filter(isFinished).reverse(); // 新しい順

  const navItem = (t: Tab, label: string, count?: number, top = false) => (
    <Link
      href={`/admin/events?tab=${t}`}
      className={`${top ? "top " : ""}${tab === t ? "active" : ""}`}
    >
      {label}
      {count !== undefined && count > 0 && <span className="muted"> ({count})</span>}
    </Link>
  );

  const tabLabels: Record<Tab, string> = {
    draft: "作成中",
    open: "募集中",
    active: "開催中",
    finished: "終了",
    new: "新規イベントの作成",
  };

  const emptyMessage: Record<Exclude<Tab, "new">, string> = {
    draft:
      "作成中のイベントはありません。新規イベントの作成フォームで「一時保存」すると、ここに入ります。",
    open: "募集中のイベントはありません。「新規イベントの作成」から作成してください。",
    active: "開催中(募集締切後)のイベントはありません。",
    finished: "終了したイベントはありません。",
  };

  const tabEvents: Record<Exclude<Tab, "new">, EventWithCount[]> = {
    draft: drafts,
    open,
    active,
    finished,
  };

  return (
    <main className="container wide">
      <h1>イベント</h1>
      {sp.error && <div className="notice error">{sp.error}</div>}
      {sp.deleted && <div className="notice success">イベントを削除しました。</div>}
      {sp.saved && (
        <div className="notice success">
          一時保存しました(作成中)。会員にはまだ公開されていません。
          イベントを開いて編集し、「公開する」で募集を開始できます。
        </div>
      )}

      <div className="settings-layout">
        <SidebarNav current={tabLabels[tab]}>
          <div className="nav-group">イベント</div>
          {navItem("draft", "作成中", drafts.length)}
          {navItem("open", "募集中", open.length)}
          {navItem("active", "開催中", active.length)}
          {navItem("finished", "終了", finished.length)}
          <div className="nav-group">新規イベント</div>
          {navItem("new", "作成")}
        </SidebarNav>

        <section className="settings-content">
          {tab === "new" ? (
            <>
              <h2>新規イベントの作成</h2>
              <div className="card">
                <p className="muted">
                  「イベントを作成する」で会員向けの申込ページが即座に公開されます。
                  すぐ公開しない場合は「一時保存」で作成中に保存できます(会員には非公開)。
                  申込は締切日時まで受け付け、応募が定員を超えた場合は選定時に抽選になります。
                </p>
                <form action={createEventAction} className="stack">
                  <label className="field">
                    イベント名
                    <input
                      type="text"
                      name="title"
                      required
                      placeholder="ファンミーティング Vol.6"
                    />
                  </label>
                  <label className="field">
                    開催日時
                    <input type="datetime-local" name="startsAt" required />
                  </label>
                  <label className="field">
                    会場
                    <input
                      type="text"
                      name="venue"
                      required
                      placeholder="渋谷カルチャーホール"
                    />
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
                  <label className="field">
                    イベント終了日時(任意。過ぎると自動で完了になります)
                    <input type="datetime-local" name="endsAt" />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="submit">イベントを作成する(公開)</button>
                    <button type="submit" name="mode" value="draft" className="secondary">
                      一時保存(作成中に保存)
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <>
              <h2>
                {tab === "draft" && "作成中"}
                {tab === "open" && "募集中"}
                {tab === "active" && "開催中(募集締切後)"}
                {tab === "finished" && "終了したイベント"}
              </h2>
              {tabEvents[tab].length === 0 ? (
                <p className="muted">{emptyMessage[tab]}</p>
              ) : (
                <EventTable events={tabEvents[tab]} finished={tab === "finished"} />
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
