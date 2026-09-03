import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listMyNotifications } from "@/lib/notify/notifications";
import { formatJst } from "@/lib/format";
import { MarkNotificationsRead } from "@/components/MarkNotificationsRead";
import { deleteNotificationAction, markNotificationsReadAction } from "./actions";

export const dynamic = "force-dynamic";

// 会員向けのお知らせ(当選・繰上当選)。
// 一覧は件名のみ表示し、タップ(クリック)で本文を展開する。
// 新着(未読)は白、既読はグレーアウトで色分けする。
// このページを開くと全件を既読にし、ヘッダーの未読バッジも消える
// (既読化は MarkNotificationsRead がクライアント側から実行する)
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const notifications = await listMyNotifications(member.id);
  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <main className="container">
      <h1>お知らせ</h1>
      {hasUnread && <MarkNotificationsRead action={markNotificationsReadAction} />}
      {sp.deleted && <div className="notice success">お知らせを削除しました。</div>}
      {notifications.length === 0 ? (
        <p className="muted">
          お知らせはまだありません。抽選の結果は<Link href="/my">申込状況</Link>
          からも確認できます。
        </p>
      ) : (
        <>
          <p className="muted">件名をタップすると本文が開きます。</p>
          {notifications.map((n) => (
            <details key={n.id} className={`notif ${n.read_at ? "read" : ""}`}>
              <summary>
                <span className="notif-subject">
                  {n.subject}
                  {!n.read_at && (
                    <>
                      {" "}
                      <span className="badge won">新着</span>
                    </>
                  )}
                </span>
                <span className="notif-date">{formatJst(n.created_at)}</span>
              </summary>
              <div className="notif-body">
                <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
                <form action={deleteNotificationAction}>
                  <input type="hidden" name="notificationId" value={n.id} />
                  <button type="submit" className="secondary small">
                    このお知らせを削除
                  </button>
                </form>
              </div>
            </details>
          ))}
        </>
      )}
    </main>
  );
}
