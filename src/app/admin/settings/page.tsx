import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { authMode } from "@/lib/auth/fansCode";
import { getJoinCode } from "@/lib/settings";
import { allowlistSummary } from "@/lib/allowlist";
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  generateJoinCodeAction,
  setJoinCodeAction,
  importAllowlistAction,
  clearAllowlistAction,
} from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  bad_code: "参加コードは空白を含まない4〜64文字で入力してください",
  no_file: "CSVファイルを選択してください",
  too_large: "ファイルが大きすぎます(5MBまで)",
  no_emails: "CSVからメールアドレスを見つけられませんでした。列にメールアドレスが含まれているか確認してください",
};

function fansPostText(code: string): string {
  return [
    "【イベント申込システムのご案内】",
    "ファンミーティング等のイベント申込・抽選結果の確認・入場チケットの受け取りは、下記の専用システムから行います。",
    "",
    `▼ ログインはこちら`,
    `${appUrl()}/login`,
    "",
    "ログインには以下の「参加コード」が必要です。このコードは会員の皆さま限定の情報です。他の方への共有はご遠慮ください。",
    "",
    `参加コード: ${code}`,
  ].join("\n");
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    imported?: string;
    cleared?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const mode = authMode();
  const code = await getJoinCode();
  const roster = await allowlistSummary();

  return (
    <main className="container">
      <p>
        <Link href="/admin/events">← イベント管理へ戻る</Link>
      </p>
      <h1>認証設定(Fans' 会員向けログイン)</h1>

      {sp.saved && <div className="notice success">参加コードを保存しました。</div>}
      {sp.imported && (
        <div className="notice success">
          会員名簿を取り込みました({sp.imported}件)。名簿にあるメールアドレスは
          参加コードなしでログインできます。
        </div>
      )}
      {sp.cleared && (
        <div className="notice success">
          会員名簿を削除しました。以後は参加コードのみで判定します。
        </div>
      )}
      {sp.error && (
        <div className="notice error">{errorMessages[sp.error] ?? "エラーが発生しました"}</div>
      )}

      <div className="card">
        <p>
          現在の認証モード:{" "}
          <strong>{mode === "fans_code" ? "fans_code(Fans' 会員向け)" : "mock(デモ用)"}</strong>
        </p>
        {mode !== "fans_code" && (
          <p className="muted">
            いまはデモ用の選択式ログインです。Fans' 会員向けの本番運用に切り替えるには、
            ホスティング側の環境変数 <code>AUTH_MODE=fans_code</code> を設定して再デプロイします
            (参加コード・会員名簿の設定はこの画面で事前に準備できます)。
          </p>
        )}
      </div>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          会員判定は<strong>「会員名簿 または 参加コード」</strong>です。
          名簿に載っているメールアドレスはコード不要でログインできます。
          参加コードは、名簿を使わない運用や、名簿の取り込み後に増えた新会員の救済用です。
          どちらか一方だけの運用でも構いません。
        </p>
      </div>

      <h2>参加コード</h2>
      <div className="card">
        <p>
          Fans' の<strong>会員限定投稿</strong>でこのコードを告知してください。
          コードを見られるのは会員だけなので、「コードを知っている = 会員」として扱います。
          退会者対策として、定期的またはイベントごとの変更をおすすめします(変更は即時反映・再デプロイ不要)。
          名簿だけで運用する場合、コードは未設定のままでも構いません。
        </p>
        <p>
          現在のコード:{" "}
          {code ? (
            <strong style={{ fontSize: "1.2rem" }}>{code}</strong>
          ) : (
            <span className="badge neutral">未設定(名簿に載っている会員のみログイン可能)</span>
          )}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <form action={generateJoinCodeAction}>
            <ConfirmSubmitButton
              message={
                code
                  ? "参加コードを新しく自動生成します。古いコードは使えなくなります(Fans' の告知も更新してください)。よろしいですか?"
                  : "参加コードを自動生成します。よろしいですか?"
              }
            >
              自動生成する
            </ConfirmSubmitButton>
          </form>
          <form action={setJoinCodeAction} style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              name="code"
              placeholder="自分で決める場合はここに入力"
              minLength={4}
              maxLength={64}
              required
              autoComplete="off"
            />
            <button type="submit" className="secondary">
              このコードにする
            </button>
          </form>
        </div>
        {code && (
          <>
            <h2 style={{ marginTop: 24 }}>会員限定投稿用の文面</h2>
            <textarea className="announce-box" readOnly defaultValue={fansPostText(code)} />
            <div style={{ marginTop: 8 }}>
              <CopyButton text={fansPostText(code)} />
            </div>
          </>
        )}
      </div>

      <h2>会員名簿(任意)</h2>
      <div className="card">
        <p>
          Fans' の管理画面からエクスポートした会員CSVを取り込むと、名簿に載っている
          メールアドレスは<strong>参加コードなしで</strong>ログインできるようになります。
          CSVに表示名が含まれていれば、初回ログイン時の表示名として自動で使われます。
        </p>
        <p className="muted">
          取り込みは必須ではありません(名簿なし+参加コードのみの運用も可)。
          取り込むたびに名簿は全て入れ替わります(洗い替え)。列の並びは自動判定するので、
          Fans' からエクスポートしたCSVをそのまま選択してください。
          名簿取り込み後に増えた新会員は、名簿を再取り込みするか、参加コードでログインできます。
        </p>
        <p>
          現在の名簿: <strong>{roster.count}件</strong>
          {roster.lastImportedAt && (
            <span className="muted">(最終取込 {formatJst(roster.lastImportedAt)})</span>
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
              message="会員名簿をすべて削除し、参加コードのみの判定に戻します。よろしいですか?"
            >
              名簿を削除して参加コードのみに戻す
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
