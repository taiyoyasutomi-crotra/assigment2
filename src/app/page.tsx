import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMember, roleHome } from "@/lib/auth/session";
import {
  listEvents,
  memberStatusLabel,
  effectiveStatus,
  isFinished,
  publicVenueLabel,
  type EventWithCount,
} from "@/lib/events";
import { listWinnerStats, type WinnerStats } from "@/lib/adminQueries";
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
        {formatJst(e.starts_at)} / {publicVenueLabel(e)}
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
  const member = await getSessionMember();
  if (member?.role === "checkin") redirect(roleHome(member));

  const events = await listEvents();
  // 進行中と完了を混ぜない: 完了したイベントは下の別セクションへ
  const active = events.filter((e) => !isFinished(e));
  const finished = events.filter(isFinished).reverse(); // 新しい順

  // 運営者ホーム: 募集中(集客率)と開催中(当選者の管理)を分けて表示
  if (member?.role === "admin") {
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

  // 公開ホーム(会員向け): 募集中のイベント一覧。ログインは不要
  const openEvents = active.filter((e) => effectiveStatus(e) === "open");
  return (
    <main className="container">
      <h1>イベント一覧</h1>
      <p className="muted">
        申込にログインは不要です。イベントを選んで、フォームに入力するだけで申込できます。
        申込済みの方の結果確認・キャンセルは、申込完了時に表示された確認ページ
        (当選連絡メールにも記載)からどうぞ。
      </p>

      <h2>募集中のイベント</h2>
      {openEvents.length === 0 ? (
        <p className="muted">現在、募集中のイベントはありません。</p>
      ) : (
        <div className="event-list">
          {openEvents.map((e) => (
            <EventCard key={e.id} event={e} finished={false} />
          ))}
        </div>
      )}
    </main>
  );
}
