import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { authMode } from "@/lib/auth/fansCode";
import { allowlistSummary } from "@/lib/allowlist";
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { listAdmins, listAllUsers } from "@/lib/admins";
import { listAllCheckinStaff } from "@/lib/checkinStaff";
import { listEvents, isFinished } from "@/lib/events";
import { setPasswordAction } from "@/app/account/actions";
import {
  importAllowlistAction,
  clearAllowlistAction,
  addAdminAction,
  removeAdminAction,
  createCheckinStaffAction,
  deleteCheckinStaffAction,
  resetUserPasswordAction,
} from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  no_file: "CSVファイルを選択してください",
  too_large: "ファイルが大きすぎます(5MBまで)",
  no_emails:
    "CSVからメールアドレスを見つけられませんでした。列にメールアドレスが含まれているか確認してください",
  invalid_name: "運営者の表示名を入力してください",
  invalid_email: "メールアドレスの形式が正しくありません",
  weak_password: "パスワードは8文字以上にしてください",
  admin_self: "自分自身は削除できません(別の運営者から削除してもらってください)",
  admin_not_found: "対象の運営者が見つかりませんでした",
  user_not_found: "対象のユーザーが見つかりませんでした",
};

// Fans' の会員向け告知に貼る案内文(コードは使わない。名簿照合のみ)
function fansPostText(): string {
  return [
    "【イベント申込システムのご案内】",
    "ファンミーティング等のイベント申込・抽選結果の確認・入場チケットの受け取りは、下記の専用システムから行います。",
    "",
    "▼ ログインはこちら",
    `${appUrl()}/login`,
    "",
    "メールアドレスを入力すると、ログイン用のリンクがメールで届きます。",
    "※イベントへの申込では、Fans' に登録しているメールアドレスをご入力ください(会員確認のうえ抽選します)",
  ].join("\n");
}

type Tab = "admins" | "staff" | "roster" | "pw_admin" | "pw_checkin" | "pw_member";

const roleLabels: Record<string, string> = {
  admin: "運営者",
  checkin: "受付",
  member: "会員",
};

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    imported?: string;
    cleared?: string;
    error?: string;
    admin_added?: string;
    admin_removed?: string;
    staff_created?: string;
    staff_deleted?: string;
    password_updated?: string;
    pw_reset?: string;
  }>;
}) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const mode = authMode();
  const tab: Tab = (
    ["admins", "staff", "roster", "pw_admin", "pw_checkin", "pw_member"] as const
  ).includes(sp.tab as Tab)
    ? (sp.tab as Tab)
    : "admins";

  const roster = await allowlistSummary();
  const admins = await listAdmins();
  const checkinStaff = await listAllCheckinStaff();
  const allUsers = await listAllUsers();
  // 受付アカウントを割り当てられるのは進行中のイベントのみ
  const assignableEvents = (await listEvents()).filter((e) => !isFinished(e));

  const navItem = (t: Tab, label: string, top = false) => (
    <Link
      href={`/admin/settings?tab=${t}`}
      className={`${top ? "top " : ""}${tab === t ? "active" : ""}`}
    >
      {label}
    </Link>
  );

  return (
    <main className="container">
      <h1>管理</h1>

      {sp.imported && (
        <div className="notice success">
          会員名簿を取り込みました({sp.imported}件)。選定(抽選)のときに
          この名簿と照合します。
        </div>
      )}
      {sp.cleared && (
        <div className="notice error">
          会員名簿を削除しました。取り込み直すまで名簿照合は行われず、
          全員が選定対象になります。
        </div>
      )}
      {sp.admin_added && <div className="notice success">運営者を追加しました。</div>}
      {sp.admin_removed && <div className="notice success">運営者を削除しました。</div>}
      {sp.staff_created && (
        <div className="notice success">
          受付アカウントを作成しました。メールアドレスとパスワードを担当者に伝えてください
          (ログイン画面からログインすると担当イベントの受付画面が開きます)。
        </div>
      )}
      {sp.staff_deleted && (
        <div className="notice success">受付アカウントを削除しました。</div>
      )}
      {sp.password_updated && (
        <div className="notice success">パスワードを変更しました。</div>
      )}
      {sp.pw_reset && (
        <div className="notice success">
          パスワードを初期化しました。新しいパスワードを本人に伝えてください。
        </div>
      )}
      {sp.error && (
        <div className="notice error">{errorMessages[sp.error] ?? sp.error}</div>
      )}

      <div className="settings-layout">
        <aside className="settings-nav">
          <div className="nav-group">ユーザー管理</div>
          {navItem("admins", "運営ユーザー")}
          {navItem("staff", "受付ユーザー")}
          {navItem("roster", "会員ユーザー(CSV)")}
          <div className="nav-group">パスワード管理</div>
          {navItem("pw_admin", "運営ユーザーパスワード")}
          {navItem("pw_checkin", "受付ユーザーパスワード")}
          {navItem("pw_member", "会員ユーザーパスワード")}
        </aside>

        <section className="settings-content">
          {tab === "admins" && (
            <>
              <h2>運営ユーザー</h2>
              <div className="card">
                <p className="muted">
                  運営者は会員名簿と関係なくログインでき、管理画面を利用できます。
                </p>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>表示名</th>
                        <th>メールアドレス</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map((a) => (
                        <tr key={a.id}>
                          <td>{a.display_name}</td>
                          <td>{a.email}</td>
                          <td>
                            {a.id === me.id ? (
                              <span className="muted">自分</span>
                            ) : (
                              <form action={removeAdminAction}>
                                <input type="hidden" name="memberId" value={a.id} />
                                <ConfirmSubmitButton
                                  className="danger small"
                                  message={`運営者「${a.display_name}」を削除します。この人は管理画面に入れなくなります。よろしいですか?`}
                                >
                                  削除
                                </ConfirmSubmitButton>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <form
                  action={addAdminAction}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 12,
                  }}
                >
                  <input type="text" name="displayName" placeholder="表示名" required />
                  <input type="email" name="email" placeholder="メールアドレス" required />
                  <button type="submit">運営者を追加</button>
                </form>
              </div>
            </>
          )}

          {tab === "staff" && (
            <>
              <h2>受付ユーザー(当日スタッフ用)</h2>
              <div className="card">
                <p className="muted">
                  当日の受付を担当するスタッフ用のアカウントです。担当イベントを決めて
                  メールアドレスとパスワードを払い出してください。ログインすると
                  担当イベントの受付画面(QR読取・参加者一覧)だけが使えます
                  (イベントの作成・選定・名簿などの管理機能には入れません)。
                  イベントが終わったら削除してください。
                </p>
                {checkinStaff.length > 0 ? (
                  <div className="table-scroll">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>表示名</th>
                          <th>ログイン用メールアドレス</th>
                          <th>担当イベント</th>
                          <th>作成日時</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {checkinStaff.map((s) => (
                          <tr key={s.id}>
                            <td>{s.display_name}</td>
                            <td>{s.email}</td>
                            <td>
                              <Link href={`/admin/events/${s.event_id}`}>
                                {s.event_title}
                              </Link>
                            </td>
                            <td>{formatJst(s.created_at)}</td>
                            <td>
                              <form action={deleteCheckinStaffAction}>
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
                ) : (
                  <p className="muted">受付アカウントはまだありません。</p>
                )}
                {assignableEvents.length > 0 ? (
                  <form
                    action={createCheckinStaffAction}
                    className="stack"
                    style={{ marginTop: 12 }}
                  >
                    <label className="field">
                      担当イベント
                      <select name="eventId" required>
                        {assignableEvents.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.title}({formatJst(e.starts_at)})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      表示名(任意)
                      <input type="text" name="displayName" placeholder="受付スタッフ" />
                    </label>
                    <label className="field">
                      ログイン用メールアドレス
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="staff@example.com"
                      />
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
                ) : (
                  <p className="muted">
                    進行中のイベントがないため、受付アカウントは作成できません。
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "roster" && (
            <>
              <h2>会員ユーザー(CSV)</h2>
              <div className="card">
                <p style={{ marginTop: 0 }}>
                  現在の認証モード:{" "}
                  <strong>
                    {mode === "fans_code" ? "fans_code(Fans' 会員向け)" : "mock(デモ用)"}
                  </strong>
                </p>
                <p className="muted" style={{ marginBottom: 0 }}>
                  ログインは誰でもできます(メール確認リンク)。会員かどうかの確認は
                  <strong>
                    選定(抽選)のときに、申込のメールアドレスを会員名簿(CSV)と照合
                  </strong>
                  して行います。名簿に載っていない申込は対象外(落選)になります。
                  {mode !== "fans_code" && (
                    <>
                      いまはデモ用の選択式ログインです。本番運用に切り替えるには、ホスティング側の
                      環境変数 <code>AUTH_MODE=fans_code</code> を設定して再デプロイします。
                    </>
                  )}
                </p>
              </div>

              <div className="card">
                <p>
                  会員のメールアドレス一覧(CSVファイル)を取り込んでください。
                  選定(抽選)のときにこの名簿と照合し、載っていないメールアドレスの申込は
                  対象外(落選)になります。
                  CSVに表示名の列が含まれていれば、初回ログイン時の表示名として自動で使われます。
                </p>
                <p className="muted">
                  取り込むたびに名簿は全て入れ替わります(洗い替え)。新会員の追加・退会者の除外は、
                  最新のCSVを再取り込みするだけで反映されます。列の並びは自動判定するので、
                  お手元の会員リストのCSVをそのまま選択してください
                  {/* TODO(hearing:Q2): 名簿CSVの入手元と更新頻度 */}
                  。
                </p>
                <p>
                  現在の名簿:{" "}
                  {roster.count > 0 ? (
                    <>
                      <strong>{roster.count}件</strong>
                      {roster.lastImportedAt && (
                        <span className="muted">
                          (最終取込 {formatJst(roster.lastImportedAt)})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="badge lost">
                      未取込(取り込むまで名簿照合は行われず、全員が選定対象になります)
                    </span>
                  )}
                </p>
                <form
                  action={importAllowlistAction}
                  style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                >
                  <input type="file" name="file" accept=".csv,text/csv,text/plain" required />
                  <button type="submit">CSVを取り込む</button>
                </form>
                {roster.count > 0 && (
                  <form action={clearAllowlistAction} style={{ marginTop: 12 }}>
                    <ConfirmSubmitButton
                      className="danger small"
                      message="会員名簿をすべて削除します。取り込み直すまで名簿照合は行われず、全員が選定対象になります。よろしいですか?"
                    >
                      名簿をすべて削除する
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>

              <h2>会員向けの案内文</h2>
              <div className="card">
                <p className="muted">
                  Fans' の投稿にそのまま貼れるログイン案内です(秘密のコード等は含みません)。
                </p>
                <textarea className="announce-box" readOnly defaultValue={fansPostText()} />
                <div style={{ marginTop: 8 }}>
                  <CopyButton text={fansPostText()} />
                </div>
              </div>
            </>
          )}

          {(tab === "pw_admin" || tab === "pw_checkin" || tab === "pw_member") &&
            (() => {
              const role =
                tab === "pw_admin" ? "admin" : tab === "pw_checkin" ? "checkin" : "member";
              const users = allUsers.filter((u) => u.role === role);
              return (
                <>
                  {tab === "pw_admin" && (
                    <>
                      <h2>自分のパスワード</h2>
                      <div className="card">
                        <p className="muted">
                          ログイン({me.email})に使うパスワードを設定・変更できます。
                          {mode !== "fans_code" && (
                            <>
                              (現在はデモ用の選択式ログインのため、パスワードは本番切替後に使われます)
                            </>
                          )}
                        </p>
                        <form action={setPasswordAction} className="stack">
                          <input type="hidden" name="from" value="admin" />
                          <label className="field">
                            新しいパスワード(8文字以上)
                            <input
                              type="password"
                              name="password"
                              required
                              minLength={8}
                              autoComplete="new-password"
                            />
                          </label>
                          <div>
                            <button type="submit">パスワードを変更する</button>
                          </div>
                        </form>
                      </div>
                    </>
                  )}

                  <h2>{roleLabels[role]}ユーザーのパスワード初期化</h2>
                  <div className="card">
                    <p className="muted">
                      {roleLabels[role]}ユーザーのパスワードを、運営者が決めた新しいパスワードで
                      上書きします(パスワードを忘れた等の問い合わせ対応用)。
                      初期化したら新しいパスワードを本人に伝えてください。
                      以前のパスワードは使えなくなります。
                    </p>
                    {users.length === 0 ? (
                      <p className="muted">対象のユーザーがいません。</p>
                    ) : (
                      <form action={resetUserPasswordAction} className="stack">
                        <input type="hidden" name="tab" value={tab} />
                        <label className="field">
                          対象ユーザー
                          <select name="memberId" required>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.display_name}({u.email})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          新しいパスワード(8文字以上。本人に伝えるため画面に表示されます)
                          <input
                            type="text"
                            name="password"
                            required
                            minLength={8}
                            autoComplete="off"
                            placeholder="本人に渡す新しいパスワード"
                          />
                        </label>
                        <div>
                          <ConfirmSubmitButton message="選択したユーザーのパスワードを初期化(上書き)します。以前のパスワードは使えなくなります。よろしいですか?">
                            パスワードを初期化する
                          </ConfirmSubmitButton>
                        </div>
                      </form>
                    )}
                  </div>
                </>
              );
            })()}
        </section>
      </div>
    </main>
  );
}
