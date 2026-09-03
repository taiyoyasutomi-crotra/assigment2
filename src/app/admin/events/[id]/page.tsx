import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import {
  getEvent,
  effectiveStatus,
  adminStatusLabel,
  isFinished,
} from "@/lib/events";
import { allowlistSummary, allowlistContains } from "@/lib/allowlist";
import { listCheckinStaff } from "@/lib/checkinStaff";
import { listApplicationsForEvent, listNotificationsForEvent } from "@/lib/adminQueries";
import { buildAnnouncement } from "@/lib/announce";
import { formatJst, toJstLocalInput } from "@/lib/format";
import { appUrl } from "@/lib/config";
import {
  closeEventAction,
  runSelectionAction,
  finishEventAction,
  deleteEventAction,
  updateEventAction,
  approveApplicationAction,
  deleteApplicationAction,
  createCheckinStaffAction,
  deleteCheckinStaffAction,
} from "@/app/admin/actions";
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
    excluded?: string;
    finished?: string;
    updated?: string;
    approved?: string;
    app_deleted?: string;
    staff_created?: string;
    staff_deleted?: string;
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
  const checkinStaff = await listCheckinStaff(id);

  // 申込チェック(GUI表示用): 名簿外のアドレスと、同一アドレスの重複申込を可視化する。
  // キャンセル済みは対象外。名簿が未取込のときは名簿照合をしない(rosterSet=null)
  const activeApps = applications.filter((a) => a.status !== "cancelled");
  const roster = await allowlistSummary();
  const rosterSet =
    roster.count > 0
      ? await allowlistContains([...new Set(activeApps.map((a) => a.email))])
      : null;
  const emailCounts = new Map<string, number>();
  for (const a of activeApps) {
    const e = a.email.toLowerCase();
    emailCounts.set(e, (emailCounts.get(e) ?? 0) + 1);
  }
  const isDup = (email: string) => (emailCounts.get(email.toLowerCase()) ?? 0) > 1;
  const isOffRoster = (email: string) =>
    rosterSet !== null && !rosterSet.has(email.toLowerCase());
  const offRosterCount = activeApps.filter((a) => isOffRoster(a.email)).length;
  const dupGroupCount = [...emailCounts.values()].filter((c) => c > 1).length;

  const eff = effectiveStatus(event);
  const finished = isFinished(event);
  const canClose = !finished && eff === "open";
  const canSelect = !finished && eff === "closed";
  // 定員・締切の変更は選定前まで
  const canEdit = !finished && eff !== "selected";

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
      {sp.finished && (
        <div className="notice success">
          イベントを完了にしました(一覧の「終了したイベント」に移動します)。
        </div>
      )}
      {sp.updated && <div className="notice success">イベント設定を変更しました。</div>}
      {sp.approved && (
        <div className="notice success">
          申込を承認しました(メールアドレスを会員名簿に追加し、選定対象になります)。
        </div>
      )}
      {sp.app_deleted && <div className="notice success">申込を削除しました。</div>}
      {sp.staff_created && (
        <div className="notice success">
          受付アカウントを作成しました。メールアドレスとパスワードを担当者に伝えてください
          (ログインはこのシステムのログイン画面から)。
        </div>
      )}
      {sp.staff_deleted && (
        <div className="notice success">受付アカウントを削除しました。</div>
      )}
      {sp.selected && (
        <div className="notice success">
          選定を実行しました(当選 {sp.selected} 名 / 待機 {sp.waitlisted ?? 0} 名
          {Number(sp.excluded) > 0 && <> / 名簿外のため対象外・落選 {sp.excluded} 名</>}
          )。当選者にのみ通知を送信しています。
        </div>
      )}
      {sp.error && <div className="notice error">{sp.error}</div>}

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <div className="label">申込数</div>
            <div className="value">{event.application_count}</div>
          </div>
          <div className="stat">
            <div className="label">定員(当選枠)</div>
            <div className="value">{event.capacity}</div>
          </div>
        </div>
        <p className="muted">
          日時: {formatJst(event.starts_at)} / 会場: {event.venue} / 申込締切:{" "}
          {formatJst(event.closes_at)}
        </p>
        {event.description && (
          <p style={{ whiteSpace: "pre-wrap" }}>{event.description}</p>
        )}
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
                {event.application_count > event.capacity
                  ? `抽選で${event.capacity}名`
                  : "定員以内・全員当選"})
              </button>
            </form>
          )}
          {!finished && (
            <Link href={`/admin/events/${event.id}/checkin`} className="button">
              受付画面を開く
            </Link>
          )}
          {!finished && (
            <form action={finishEventAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <ConfirmSubmitButton
                className="secondary"
                message={`「${event.title}」を完了にします。一覧の「終了したイベント」に移り、申込・受付はできなくなります。よろしいですか?`}
              >
                イベントを完了にする
              </ConfirmSubmitButton>
            </form>
          )}
          <form action={deleteEventAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <ConfirmSubmitButton
              className="danger"
              message={`「${event.title}」を削除します。申込(${event.application_count}件)・チケット・通知履歴もすべて消え、元に戻せません。本当に削除しますか?`}
            >
              イベントを削除する
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      {canEdit && (
        <>
          <h2>イベント設定の変更</h2>
          <div className="card">
            <p className="muted">
              定員(当選人数)・申込締切・概要は選定前まで変更できます。
              締切を未来の日時に延ばすと、募集中に戻ります。
            </p>
            <form action={updateEventAction} className="stack">
              <input type="hidden" name="eventId" value={event.id} />
              <label className="field">
                定員(当選人数)
                <input
                  type="number"
                  name="capacity"
                  required
                  min={1}
                  defaultValue={event.capacity}
                />
              </label>
              <label className="field">
                申込締切日時
                <input
                  type="datetime-local"
                  name="closesAt"
                  required
                  defaultValue={toJstLocalInput(event.closes_at)}
                />
              </label>
              <label className="field">
                概要(任意)
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={event.description ?? ""}
                  placeholder="イベントの内容・持ち物・注意事項など。会員向けの申込ページと告知文に表示されます"
                />
              </label>
              <div>
                <button type="submit">変更を保存する</button>
              </div>
            </form>
          </div>
        </>
      )}

      <h2>受付アカウント(当日スタッフ用)</h2>
      <div className="card">
        <p className="muted">
          当日の受付を担当するスタッフ用のアカウントです。ログインすると
          このイベントの受付画面(QR読取・参加者ボード)だけが使えます
          (イベントの作成・選定・名簿などの管理機能には入れません)。
          メールアドレスとパスワードを決めて払い出し、イベントが終わったら削除してください。
        </p>
        {checkinStaff.length > 0 && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>表示名</th>
                  <th>ログイン用メールアドレス</th>
                  <th>作成日時</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {checkinStaff.map((s) => (
                  <tr key={s.id}>
                    <td>{s.display_name}</td>
                    <td>{s.email}</td>
                    <td>{formatJst(s.created_at)}</td>
                    <td>
                      <form action={deleteCheckinStaffAction}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="staffId" value={s.id} />
                        <ConfirmSubmitButton
                          className="danger small"
                          message={`受付アカウント「${s.display_name}」(${s.email})を削除します。以後このアカウントではログインできなくなります。よろしいですか?`}
                        >
                          削除
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!finished && (
          <form action={createCheckinStaffAction} className="stack">
            <input type="hidden" name="eventId" value={event.id} />
            <label className="field">
              表示名(任意)
              <input type="text" name="displayName" placeholder="受付スタッフ" />
            </label>
            <label className="field">
              ログイン用メールアドレス
              <input type="email" name="email" required placeholder="staff@example.com" />
            </label>
            <label className="field">
              パスワード(8文字以上。担当者に伝えるため画面に表示されます)
              <input
                type="text"
                name="password"
                required
                minLength={8}
                autoComplete="off"
                placeholder="担当者に渡すパスワード"
              />
            </label>
            <div>
              <button type="submit">受付アカウントを作成する</button>
            </div>
          </form>
        )}
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
      {offRosterCount > 0 && (
        <div className="notice error">
          会員名簿に載っていないメールアドレスの申込が {offRosterCount} 件あります。
          申込数に数えず、選定(抽選)でも対象外・落選になります。
          会員と確認できた場合は「承認」、そうでなければ「削除」で整理してください。
        </div>
      )}
      {dupGroupCount > 0 && (
        <div className="notice info">
          同じメールアドレスからの申込が {dupGroupCount} 組あります(重複の可能性)。
        </div>
      )}
      {roster.count === 0 && activeApps.length > 0 && (
        <p className="muted">
          会員名簿が未取込のため、名簿との照合は行っていません(全員が選定対象)。
        </p>
      )}
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
                  <td>
                    {a.email}
                    {a.status !== "cancelled" && isOffRoster(a.email) && (
                      <>
                        {" "}
                        <span className="badge lost">名簿外</span>
                      </>
                    )}
                    {a.status !== "cancelled" && isDup(a.email) && (
                      <>
                        {" "}
                        <span className="badge waitlisted">重複</span>
                      </>
                    )}
                  </td>
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
                    {a.status !== "cancelled" && isOffRoster(a.email) && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <form action={approveApplicationAction}>
                          <input type="hidden" name="applicationId" value={a.id} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <ConfirmSubmitButton
                            className="small"
                            message={`「${a.display_name}」(${a.email})を会員として承認し、メールアドレスを会員名簿に追加します。この申込は申込数・選定の対象になります。※次に名簿CSVを取り込み直すと上書きされるため、正式には次回のCSVに反映してください。`}
                          >
                            承認
                          </ConfirmSubmitButton>
                        </form>
                        <form action={deleteApplicationAction}>
                          <input type="hidden" name="applicationId" value={a.id} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <ConfirmSubmitButton
                            className="danger small"
                            message={`「${a.display_name}」(${a.email})の申込を削除します。元に戻せません。よろしいですか?`}
                          >
                            削除
                          </ConfirmSubmitButton>
                        </form>
                      </div>
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
