import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { authMode } from "@/lib/auth/fansCode";
import { allowlistSummary } from "@/lib/allowlist";
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { listAdmins } from "@/lib/admins";
import { setPasswordAction } from "@/app/account/actions";
import {
  importAllowlistAction,
  clearAllowlistAction,
  pasteImportAction,
  addAdminAction,
  removeAdminAction,
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

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    imported?: string;
    cleared?: string;
    error?: string;
    admin_added?: string;
    admin_removed?: string;
    password_updated?: string;
  }>;
}) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const mode = authMode();
  const roster = await allowlistSummary();
  const admins = await listAdmins();

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
      {sp.password_updated && (
        <div className="notice success">パスワードを変更しました。</div>
      )}
      {sp.error && (
        <div className="notice error">{errorMessages[sp.error] ?? "エラーが発生しました"}</div>
      )}

      <h2>認証設定</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          現在の認証モード:{" "}
          <strong>{mode === "fans_code" ? "fans_code(Fans' 会員向け)" : "mock(デモ用)"}</strong>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          ログインは誰でもできます(メール確認リンク)。会員かどうかの確認は
          <strong>選定(抽選)のときに、申込のメールアドレスを会員名簿(CSV)と照合</strong>
          して行います。名簿に載っていない申込は対象外(落選)になります。
          {mode !== "fans_code" && (
            <>
              いまはデモ用の選択式ログインです。本番運用に切り替えるには、ホスティング側の
              環境変数 <code>AUTH_MODE=fans_code</code> を設定して再デプロイします。
            </>
          )}
        </p>
      </div>

      <h2>運営者</h2>
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
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}
        >
          <input type="text" name="displayName" placeholder="表示名" required />
          <input type="email" name="email" placeholder="メールアドレス" required />
          <button type="submit">運営者を追加</button>
        </form>
      </div>

      {mode === "fans_code" && (
        <>
          <h2>自分のパスワード</h2>
          <div className="card">
            <p className="muted">
              ログイン({me.email})に使うパスワードを設定・変更できます。
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

      <h2>会員名簿</h2>
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
          {/* TODO(hearing:Q2): 名簿CSVの入手元と更新頻度。Fans' にはエクスポート機能が
              ないことを確認済みのため、運営者が別途保持している会員連絡先リストを想定 */}
          。
        </p>
        <p>
          現在の名簿:{" "}
          {roster.count > 0 ? (
            <>
              <strong>{roster.count}件</strong>
              {roster.lastImportedAt && (
                <span className="muted">(最終取込 {formatJst(roster.lastImportedAt)})</span>
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

      <h2>貼り付けで取込(代替手段)</h2>
      <div className="card">
        <p className="muted">
          ファイル選択が使えない場合は、CSVファイルをメモ帳等で開いて内容をコピーし、
          ここに貼り付けて取り込めます。スプレッドシートの表を直接コピーして
          貼り付けても構いません(タブ区切りにも対応)。
        </p>
        <form action={pasteImportAction} className="stack" style={{ maxWidth: "100%" }}>
          <textarea
            name="csv"
            className="announce-box"
            placeholder="CSVの内容をここに貼り付け"
            required
          />
          <div>
            <button type="submit">貼り付けた内容を取り込む</button>
          </div>
        </form>
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
    </main>
  );
}
