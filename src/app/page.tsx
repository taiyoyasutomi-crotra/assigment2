import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import {
  listMyApplications,
  isEventFinishedForApplication,
  type MyApplication,
} from "@/lib/applications";
import {
  listEvents,
  memberStatusLabel,
  effectiveStatus,
  isFinished,
  type EventWithCount,
} from "@/lib/events";
import { listWinnerStats, type WinnerStats } from "@/lib/adminQueries";
import { countUnreadNotifications } from "@/lib/notify/notifications";
import { formatJst } from "@/lib/format";
import { SidebarNav } from "@/components/SidebarNav";

export const dynamic = "force-dynamic";

const badgeClass: Record<string, string> = {
  募集中: "open",
  締切: "closed",
  終了: "finished",
};

function EventCard({
  event: e,
  finished,
  href,
}: {
  event: EventWithCount;
  finished: boolean;
  href?: string;
}) {
  const label = memberStatusLabel(e);
  return (
    <Link href={href ?? `/events/${e.id}`} className="event-card">
      <div className="title">
        {e.title}{" "}
        {finished ? (
          <span className="badge finished">✓ 完了</span>
        ) : (
          <span className={`badge ${badgeClass[label] ?? "neutral"}`}>{label}</span>
        )}
      </div>
      <div className="meta">
        {formatJst(e.starts_at)} / {e.venue}
        {!finished && effectiveStatus(e) === "open" && (
          <> / 申込締切 {formatJst(e.closes_at)}</>
        )}
      </div>
    </Link>
  );
}

/** 運営者ホーム用: 募集中カード(集客率つき)。クリックでイベント管理へ */
function AdminOpenEventCard({ event: e }: { event: EventWithCount }) {
  const rate = Math.round((e.application_count / e.capacity) * 100);
  return (
    <Link href={`/admin/events/${e.id}`} className="event-card">
      <div className="title">
        {e.title} <span className="badge open">募集中</span>
      </div>
      <div className="meta">
        {formatJst(e.starts_at)} / {e.venue} / 申込締切 {formatJst(e.closes_at)}
      </div>
      <div className="meta" style={{ marginTop: 8 }}>
        申込 {e.application_count}件 / 定員 {e.capacity}名(集客率{" "}
        <strong>{rate}%</strong>)
      </div>
      <div className="progress">
        <span
          className={rate >= 100 ? "full" : ""}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
    </Link>
  );
}

/** 運営者ホーム用: 開催中カード。当選者の管理(受付画面)へ直行できる */
function AdminActiveEventCard({
  event: e,
  stats,
}: {
  event: EventWithCount;
  stats: WinnerStats | undefined;
}) {
  return (
    <div className="event-card">
      <div className="title">
        {e.title} <span className="badge closed">開催中</span>
      </div>
      <div className="meta">
        {formatJst(e.starts_at)} / {e.venue}
        {stats
          ? ` / 当選者 ${stats.won}名(入場済み ${stats.checked_in}名)`
          : " / 選定はまだ実行されていません"}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href={`/admin/events/${e.id}/checkin`} className="button">
          当選者の管理(受付画面)
        </Link>
        <Link href={`/admin/events/${e.id}`} className="button secondary">
          イベント管理
        </Link>
      </div>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const events = await listEvents();
  // 進行中と完了を混ぜない: 完了したイベントは下の別セクションへ
  const active = events.filter((e) => !isFinished(e));
  const finished = events.filter(isFinished).reverse(); // 新しい順

  const myApplications = member.role === "admin" ? [] : await listMyApplications(member.id);

  // 運営者ホーム: 募集中(集客率)と開催中(当選者の管理)を分けて表示
  if (member.role === "admin") {
    const open = active.filter((e) => effectiveStatus(e) === "open");
    const running = active.filter((e) => effectiveStatus(e) !== "open");
    const winnerStats = running.length > 0 ? await listWinnerStats() : new Map();
    return (
      <main className="container">
        <h1>ホーム</h1>
        <h2 style={{ marginTop: 8 }}>開催中のイベント(募集締切後〜開催)</h2>
        {running.length === 0 ? (
          <p className="muted">開催中のイベントはありません。</p>
        ) : (
          <div className="event-list">
            {running.map((e) => (
              <AdminActiveEventCard key={e.id} event={e} stats={winnerStats.get(e.id)} />
            ))}
          </div>
        )}

        <h2>募集中のイベント</h2>
        {open.length === 0 ? (
          <p className="muted">
            募集中のイベントはありません。
            <Link href="/admin/events?tab=new">新規イベントを作成する</Link>
          </p>
        ) : (
          <div className="event-list">
            {open.map((e) => (
              <AdminOpenEventCard key={e.id} event={e} />
            ))}
          </div>
        )}

        {finished.length > 0 && (
          <>
            <h2>終了したイベント</h2>
            <div className="event-list">
              {finished.map((e) => (
                <EventCard key={e.id} event={e} finished={true} href={`/admin/events/${e.id}`} />
              ))}
            </div>
          </>
        )}
      </main>
    );
  }

  // 会員ホーム: 自分との関わりで4つに仕分ける
  // 参加予定(当選) / 抽選中 / 募集中(未応募) / 終了(参加履歴)
  const unread = await countUnreadNotifications(member.id);
  const wins = myApplications.filter(
    (a) => a.status === "won" && !isEventFinishedForApplication(a)
  );
  const applying = myApplications.filter(
    (a) =>
      (a.status === "applied" || a.status === "waitlisted") &&
      !isEventFinishedForApplication(a)
  );
  const appliedEventIds = new Set(myApplications.map((a) => a.event_id));
  const openEvents = active.filter(
    (e) => effectiveStatus(e) === "open" && !appliedEventIds.has(e.id)
  );
  const pastWins = myApplications
    .filter((a) => a.status === "won" && isEventFinishedForApplication(a))
    .reverse(); // 新しい順

  type MemberTab = "wins" | "applying" | "open" | "past";
  const validTabs: MemberTab[] = ["wins", "applying", "open", "past"];
  // タブ未指定時は「中身のある一番上のタブ」を開く
  const defaultTab: MemberTab =
    wins.length > 0 ? "wins" : applying.length > 0 ? "applying" : "open";
  const tab: MemberTab = validTabs.includes(sp.tab as MemberTab)
    ? (sp.tab as MemberTab)
    : defaultTab;

  const tabLabels: Record<MemberTab, string> = {
    wins: "参加予定(当選)",
    applying: "抽選中",
    open: "募集中(未応募)",
    past: "終了(参加履歴)",
  };

  const navItem = (t: MemberTab, count: number) => (
    <Link
      href={`/?tab=${t}`}
      className={tab === t ? "active" : ""}
    >
      {tabLabels[t]}
      {count > 0 && <span className="muted"> ({count})</span>}
    </Link>
  );

  const winCard = (a: MyApplication, past: boolean) => (
    <div key={a.id} className="event-card">
      <div className="title">
        {a.title}{" "}
        {past ? (
          <span className="badge finished">✓ 参加(終了)</span>
        ) : (
          <span className="badge won">当選</span>
        )}
      </div>
      <div className="meta">
        {formatJst(a.starts_at)} / {a.venue}
      </div>
      {!past && a.ticket_id && (
        <div style={{ marginTop: 10 }}>
          <Link href={`/my/tickets/${a.ticket_id}`} className="button">
            入場QRチケットを表示
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <main className="container">
      <h1>イベント一覧</h1>
      {unread > 0 && (
        <div className="notice success">
          新しいお知らせが{unread}件あります(抽選・繰上の結果)。{" "}
          <Link href="/notifications">お知らせを確認する</Link>
        </div>
      )}

      <div className="settings-layout">
        <SidebarNav current={tabLabels[tab]}>
          <div className="nav-group">マイイベント</div>
          {navItem("wins", wins.length)}
          {navItem("applying", applying.length)}
          {navItem("open", openEvents.length)}
          {navItem("past", pastWins.length)}
        </SidebarNav>

        <section className="settings-content">
          <h2>{tabLabels[tab]}</h2>

          {tab === "wins" &&
            (wins.length === 0 ? (
              <p className="muted">
                参加予定のイベントはありません。抽選結果は「抽選中」タブと
                <Link href="/my">申込状況</Link>で確認できます。
              </p>
            ) : (
              <div className="event-list">{wins.map((a) => winCard(a, false))}</div>
            ))}

          {tab === "applying" &&
            (applying.length === 0 ? (
              <p className="muted">
                抽選中の申込はありません。「募集中(未応募)」タブからお申し込みください。
              </p>
            ) : (
              <div className="event-list">
                {applying.map((a) => (
                  <Link key={a.id} href={`/events/${a.event_id}`} className="event-card">
                    <div className="title">
                      {a.title} <span className="badge applied">抽選中</span>
                    </div>
                    <div className="meta">
                      {formatJst(a.starts_at)} / {a.venue} / 申込日{" "}
                      {formatJst(a.applied_at)}
                    </div>
                  </Link>
                ))}
              </div>
            ))}

          {tab === "open" &&
            (openEvents.length === 0 ? (
              <p className="muted">現在、未応募で募集中のイベントはありません。</p>
            ) : (
              <div className="event-list">
                {openEvents.map((e) => (
                  <EventCard key={e.id} event={e} finished={false} />
                ))}
              </div>
            ))}

          {tab === "past" &&
            (pastWins.length === 0 ? (
              <p className="muted">終了した参加イベントはまだありません。</p>
            ) : (
              <div className="event-list">{pastWins.map((a) => winCard(a, true))}</div>
            ))}
        </section>
      </div>
    </main>
  );
}
