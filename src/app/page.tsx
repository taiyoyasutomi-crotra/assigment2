import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
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

function EventCard({ event: e, finished }: { event: EventWithCount; finished: boolean }) {
  const label = memberStatusLabel(e);
  const remaining = Math.max(0, e.application_limit - e.application_count);
  return (
    <Link href={`/events/${e.id}`} className="event-card">
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
  await requireMember();
  const events = await listEvents();
  // 進行中と完了を混ぜない: 完了したイベントは下の別セクションへ
  const active = events.filter((e) => !isFinished(e));
  const finished = events.filter(isFinished).reverse(); // 新しい順
  return (
    <main className="container">
      <h1>イベント一覧</h1>
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
