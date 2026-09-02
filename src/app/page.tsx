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
  const remaining = Math.max(0, e.application_limit - e.application_count);
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
          <> / 残り{remaining}枠(締切 {formatJst(e.closes_at)})</>
        )}
      </div>
    </Link>
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

  return (
    <main className="container">
      <h1>イベント一覧</h1>
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
      {member.role === "admin" && active.length > 0 && (
        <p className="muted">
          イベントを開くと受付画面(当日の来場客管理)に移動します。
        </p>
      )}
      {active.length === 0 && <p className="muted">開催予定のイベントはありません</p>}
      <div className="event-list">
        {active.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            finished={false}
            // 運営者は当日の受付にすぐ入れるよう、受付画面へ直行させる
            href={
              member.role === "admin" ? `/admin/events/${e.id}/checkin` : undefined
            }
          />
        ))}
      </div>
      {finished.length > 0 && (
        <>
          <h2>終了したイベント</h2>
          <div className="event-list">
            {finished.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                finished={true}
                href={member.role === "admin" ? `/admin/events/${e.id}` : undefined}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
