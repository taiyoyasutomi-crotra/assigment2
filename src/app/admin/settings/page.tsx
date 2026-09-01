import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { authMode } from "@/lib/auth/fansCode";
import { allowlistSummary } from "@/lib/allowlist";
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  importAllowlistAction,
  clearAllowlistAction,
  pasteImportAction,
} from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  no_file: "CSVファイルを選択してください",
  too_large: "ファイルが大きすぎます(5MBまで)",
  no_emails:
    "CSVからメールアドレスを見つけられませんでした。列にメールアドレスが含まれているか確認してください",
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
    "Fans' に登録しているメールアドレスを入力すると、ログイン用のリンクがメールで届きます。",
    "(会員の方のみログインできます。メールが届かない場合は運営までお知らせください)",
  ].join("\n");
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    imported?: string;
    cleared?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const mode = authMode();
  const roster = await allowlistSummary();

  return (
    <main className="container">
      <p>
        <Link href="/admin/events">← イベント管理へ戻る</Link>
      </p>
      <h1>認証設定(Fans' 会員向けログイン)</h1>

      {sp.imported && (
        <div className="notice success">
          会員名簿を取り込みました({sp.imported}件)。名簿にあるメールアドレスだけが
          ログインできます。
        </div>
      )}
      {sp.cleared && (
        <div className="notice error">
          会員名簿を削除しました。名簿を取り込むまで、会員はログインできません。
        </div>
      )}
      {sp.error && (
        <div className="notice error">{errorMessages[sp.error] ?? "エラーが発生しました"}</div>
      )}

      <div className="card">
        <p style={{ marginTop: 0 }}>
          現在の認証モード:{" "}
          <strong>{mode === "fans_code" ? "fans_code(Fans' 会員向け)" : "mock(デモ用)"}</strong>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          会員判定は <strong>Fans' の会員名簿(CSV)との照合のみ</strong>で行います。
          名簿にあるメールアドレスにだけログインリンクを送ります。
          {mode !== "fans_code" && (
            <>
              いまはデモ用の選択式ログインです。本番運用に切り替えるには、ホスティング側の
              環境変数 <code>AUTH_MODE=fans_code</code> を設定して再デプロイします。
            </>
          )}
        </p>
      </div>

      <h2>会員名簿</h2>
      <div className="card">
        <p>
          会員のメールアドレス一覧(CSVファイル)を取り込んでください。
          名簿に載っているメールアドレスだけがログインできます(運営者は除く)。
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
              未取込(名簿を取り込むまで会員はログインできません)
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
              message="会員名簿をすべて削除します。名簿を取り込み直すまで会員はログインできなくなります。よろしいですか?"
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
