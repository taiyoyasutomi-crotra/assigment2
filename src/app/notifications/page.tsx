import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import {
  listMyNotifications,
  markAllNotificationsRead,
} from "@/lib/notify/notifications";
import { formatJst } from "@/lib/format";

export const dynamic = "force-dynamic";

// 会員向けのお知らせ(当選・繰上当選)。
// 開いた時点で全件を既読にする(未読バッジはナビから消える)
export default async function NotificationsPage() {
  const member = await requireMember();
  const notifications = await listMyNotifications(member.id);
  await markAllNotificationsRead(member.id);

  return (
    <main className="container">
      <h1>お知らせ</h1>
      {notifications.length === 0 ? (
        <p className="muted">
          お知らせはまだありません。抽選の結果は<Link href="/my">申込状況</Link>
          からも確認できます。
        </p>
      ) : (
        <div className="event-list">
          {notifications.map((n) => (
            <div key={n.id} className="event-card">
              <div className="title">
                {n.subject}{" "}
                {!n.read_at && <span className="badge won">新着</span>}
              </div>
              <div className="meta">{formatJst(n.created_at)}</div>
              <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
