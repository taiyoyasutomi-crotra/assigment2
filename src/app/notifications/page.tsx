import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listMyNotifications } from "@/lib/notify/notifications";
import { formatJst } from "@/lib/format";
import { NotificationItem } from "@/components/NotificationItem";
import {
  deleteNotificationAction,
  markOneNotificationReadAction,
} from "./actions";

export const dynamic = "force-dynamic";

// 会員向けのお知らせ(当選・繰上当選)。
// 一覧は件名のみ表示し、タップ(クリック)で本文を展開する。
// 新着(未読)は白、既読はグレーアウトで色分けする。
// 既読になるのは「件名をタップして本文を開いたとき」だけ(1件ずつ)。
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const notifications = await listMyNotifications(member.id);

  return (
    <main className="container">
      <h1>お知らせ</h1>
      {sp.deleted && <div className="notice success">お知らせを削除しました。</div>}
      {notifications.length === 0 ? (
        <p className="muted">
          お知らせはまだありません。抽選の結果は<Link href="/my">申込状況</Link>
          からも確認できます。
        </p>
      ) : (
        <>
          <p className="muted">件名をタップすると本文が開き、既読になります。</p>
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              id={n.id}
              subject={n.subject}
              dateLabel={formatJst(n.created_at)}
              initiallyRead={!!n.read_at}
              markAction={markOneNotificationReadAction}
            >
              <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
              <form action={deleteNotificationAction}>
                <input type="hidden" name="notificationId" value={n.id} />
                <button type="submit" className="secondary small">
                  このお知らせを削除
                </button>
              </form>
            </NotificationItem>
          ))}
        </>
      )}
    </main>
  );
}
