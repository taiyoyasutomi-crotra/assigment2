import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listEvents, memberStatusLabel, effectiveStatus } from "@/lib/events";
import { formatJst } from "@/lib/format";

export const dynamic = "force-dynamic";

const badgeClass: Record<string, string> = {
  募集中: "open",
  締切: "closed",
  終了: "finished",
};

export default async function HomePage() {
  await requireMember();
  const events = await listEvents();
  return (
    <main className="container">
      <h1>イベント一覧</h1>
      {events.length === 0 && <p className="muted">公開中のイベントはありません</p>}
      <div className="event-list">
        {events.map((e) => {
          const label = memberStatusLabel(e);
          const remaining = Math.max(0, e.application_limit - e.application_count);
          return (
            <Link key={e.id} href={`/events/${e.id}`} className="event-card">
              <div className="title">
                {e.title}{" "}
                <span className={`badge ${badgeClass[label] ?? "neutral"}`}>{label}</span>
              </div>
              <div className="meta">
                {formatJst(e.starts_at)} / {e.venue}
                {effectiveStatus(e) === "open" && (
                  <> / 残り{remaining}枠(締切 {formatJst(e.closes_at)})</>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
