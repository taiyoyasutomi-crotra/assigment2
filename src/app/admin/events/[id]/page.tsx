import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getEvent, effectiveStatus, adminStatusLabel, isLottery } from "@/lib/events";
import { listApplicationsForEvent, listNotificationsForEvent } from "@/lib/adminQueries";
import { buildAnnouncement } from "@/lib/announce";
import { formatJst } from "@/lib/format";
import { appUrl } from "@/lib/config";
import { closeEventAction, runSelectionAction } from "@/app/admin/actions";
import { CopyButton } from "@/components/CopyButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { CancelButton } from "@/components/CancelButton";

export const dynamic = "force-dynamic";

const appStatusLabels: Record<string, { label: string; badge: string }> = {
  applied: { label: "申込済み", badge: "applied" },
  won: { label: "当選", badge: "won" },
  waitlisted: { label: "待機", badge: "waitlisted" },
  lost: { label: "落選", badge: "lost" },
  cancelled: { label: "キャンセル", badge: "cancelled" },
};

export default async function AdminEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    closed?: string;
    selected?: string;
    waitlisted?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const event = await getEvent(id);
  if (!event) notFound();
  const applications = await listApplicationsForEvent(id);
  const notifications = await listNotificationsForEvent(id);

  const eff = effectiveStatus(event);
  const canClose = eff === "open";
  const canSelect = eff === "closed";

  return (
    <main className="container">
      <p>
        <Link href="/admin/events">← イベント管理へ戻る</Link>
      </p>
      <h1>
        {event.title}{" "}
        <span className="badge neutral">{adminStatusLabel(event)}</span>
      </h1>

      {sp.created && (
        <div className="notice success">
          イベントを作成しました。会員向けの申込ページが公開されています:{" "}
          <Link href={`/events/${event.id}`}>{`${appUrl()}/events/${event.id}`}</Link>
        </div>
      )}
      {sp.closed && <div className="notice success">募集を締め切りました。</div>}
      {sp.selected && (
        <div className="notice success">
          選定を実行しました(当選 {sp.selected} 名 / 待機 {sp.waitlisted ?? 0} 名)。
          当選者にのみ通知を送信しています。
        </div>
      )}
      {sp.error && <div className="notice error">{sp.error}</div>}

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <div className="label">申込数 / 受付上限</div>
            <div className="value">
              {event.application_count} / {event.application_limit}
            </div>
          </div>
          <div className="stat">
            <div className="label">定員(当選枠)</div>
            <div className="value">{event.capacity}</div>
          </div>
          <div className="stat">
            <div className="label">方式</div>
            <div className="value">{isLottery(event) ? "抽選" : "先着"}</div>
          </div>
        </div>
        <p className="muted">
          日時: {formatJst(event.starts_at)} / 会場: {event.venue} / 申込締切:{" "}
          {formatJst(event.closes_at)}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canClose && (
            <form action={closeEventAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <ConfirmSubmitButton
                className="danger"
                message={`「${event.title}」の募集を締め切ります。締切後は申込できなくなり、参加者の選定が可能になります。よろしいですか?`}
              >
                募集を締め切る
              </ConfirmSubmitButton>
            </form>
          )}
          {canSelect && (
            <form action={runSelectionAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <button type="submit">
                選定を実行(
                {isLottery(event) ? `抽選で${event.capacity}名` : "先着・全員当選"})
              </button>
            </form>
          )}
          <Link href={`/admin/events/${event.id}/checkin`} className="button">
            受付画面を開く
          </Link>
        </div>
      </div>

      <h2>告知文</h2>
      <div className="card">
        <p className="muted">
          コピーしてコミュニティのチャットに投稿してください(投稿は手動)。
        </p>
        <textarea
          className="announce-box"
          readOnly
          defaultValue={buildAnnouncement(event)}
        />
        <div style={{ marginTop: 8 }}>
          <CopyButton text={buildAnnouncement(event)} />
        </div>
      </div>

      <h2>申込一覧</h2>
      {applications.length === 0 ? (
        <p className="muted">申込はまだありません。</p>
      ) : (
        <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>表示名</th>
              <th>連絡先メール</th>
              <th>申込日時</th>
              <th>状態</th>
              <th>チケット</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => {
              const s = appStatusLabels[a.status] ?? {
                label: a.status,
                badge: "neutral",
              };
              return (
                <tr key={a.id}>
                  <td>{a.display_name}</td>
                  <td>{a.email}</td>
                  <td>{formatJst(a.applied_at)}</td>
                  <td>
                    <span className={`badge ${s.badge}`}>
                      {s.label}
                      {a.status === "waitlisted" && a.waitlist_order != null && (
                        <> {a.waitlist_order}位</>
                      )}
                    </span>
                  </td>
                  <td>
                    {a.ticket_id ? (
                      a.revoked_at ? (
                        <span className="muted">無効化済み</span>
                      ) : a.checked_in_at ? (
                        <>入場済み {formatJst(a.checked_in_at)}</>
                      ) : (
                        "未入場"
                      )
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {a.status === "won" && (
                      <CancelButton applicationId={a.id} eventId={event.id} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <h2>通知履歴</h2>
      {notifications.length === 0 ? (
        <p className="muted">通知はまだありません。</p>
      ) : (
        <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>日時</th>
              <th>宛先</th>
              <th>種別</th>
              <th>件名</th>
              <th>送信結果</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.id}>
                <td>{formatJst(n.created_at)}</td>
                <td>
                  {n.display_name}
                  <br />
                  <span className="muted">{n.email}</span>
                </td>
                <td>{n.kind === "promotion_won" ? "繰上当選" : "当選"}</td>
                <td>{n.subject}</td>
                <td>
                  {n.status === "sent" && <span className="badge won">送信済み</span>}
                  {n.status === "failed" && (
                    <>
                      <span className="badge lost">失敗</span>
                      <br />
                      <span className="muted">{n.error}</span>
                    </>
                  )}
                  {n.status === "pending" && (
                    <span className="badge neutral">送信中</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}
