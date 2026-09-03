import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listMyApplications } from "@/lib/applications";
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

export default async function HomePage() {
  const member = await requireMember();
  const events = await listEvents();
  // 進行中と完了を混ぜない: 完了したイベントは下の別セクションへ
  const active = events.filter((e) => !isFinished(e));
  const finished = events.filter(isFinished).reverse(); // 新しい順

  // 参加予定: 当選していて、まだ開催が終わっていないイベント。
  // 当日にQRチケットへすぐ辿り着けるよう、ホームの最上部に出す
  const myApplications = member.role === "admin" ? [] : await listMyApplications(member.id);
  const upcomingWins = myApplications.filter(
    (a) =>
      a.status === "won" &&
      a.ticket_id &&
      new Date(a.starts_at).getTime() > Date.now() - 24 * 3600 * 1000
  );

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

  const unread = await countUnreadNotifications(member.id);

  return (
    <main className="container">
      <h1>イベント一覧</h1>
      {unread > 0 && (
        <div className="notice success">
          新しいお知らせが{unread}件あります(抽選・繰上の結果)。{" "}
          <Link href="/notifications">お知らせを確認する</Link>
        </div>
      )}
      {upcomingWins.length > 0 && (
        <>
          <h2 style={{ marginTop: 8 }}>参加予定のイベント</h2>
          <div className="event-list">
            {upcomingWins.map((a) => (
              <div key={a.id} className="event-card">
                <div className="title">
                  {a.title} <span className="badge won">当選</span>
                </div>
                <div className="meta">
                  {formatJst(a.starts_at)} / {a.venue}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Link href={`/my/tickets/${a.ticket_id}`} className="button">
                    入場QRチケットを表示
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {active.length === 0 && <p className="muted">開催予定のイベントはありません</p>}
      <div className="event-list">
        {active.map((e) => (
          <EventCard key={e.id} event={e} finished={false} />
        ))}
      </div>
      {finished.length > 0 && (
        <>
          <h2>終了したイベント</h2>
          <div className="event-list">
            {finished.map((e) => (
              <EventCard key={e.id} event={e} finished={true} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
