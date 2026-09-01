import { authProvider } from "@/lib/auth/provider";
import { authMode } from "@/lib/auth/fansCode";
import { loginAction, requestLoginLinkAction } from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  "1": "ログインに失敗しました",
  invalid_code: "参加コードが正しくありません",
  invalid_email: "メールアドレスの形式が正しくありません",
  send_failed: "メールの送信に失敗しました。時間をおいて再度お試しください",
  invalid_link: "ログインリンクが無効か、有効期限(15分)が切れています。もう一度お試しください",
  code_unset:
    "参加コードがまだ設定されていません。運営者にお問い合わせください",
  not_member:
    "このメールアドレスは会員名簿に見つかりませんでした。Fans' に登録しているメールアドレスでお試しください",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const mode = authMode();

  if (mode === "fans_code") {
    return (
      <main className="container">
        <h1>ログイン</h1>
        <p className="muted">
          Fans'
          の会員限定投稿でお知らせしている「参加コード」と、連絡を受け取るメールアドレスを入力してください。
          ログイン用のリンクをメールでお送りします。
        </p>
        {error && (
          <div className="notice error">{errorMessages[error] ?? "エラーが発生しました"}</div>
        )}
        {sent ? (
          <div className="notice success">
            ログインリンクをメールで送信しました(有効期限15分)。メールをご確認ください。
            届かない場合は迷惑メールフォルダもご確認ください。
          </div>
        ) : (
          <div className="card">
            <form action={requestLoginLinkAction} className="stack">
              <label className="field">
                表示名(初回登録時に使用します)
                <input type="text" name="displayName" placeholder="ニックネーム" />
              </label>
              <label className="field">
                メールアドレス
                <input type="email" name="email" required placeholder="you@example.com" />
              </label>
              <label className="field">
                参加コード(Fans' の会員限定投稿に記載)
                <input type="text" name="joinCode" required autoComplete="off" />
              </label>
              <button type="submit">ログインリンクを送る</button>
            </form>
          </div>
        )}
      </main>
    );
  }

  const candidates = await authProvider.listLoginCandidates();
  return (
    <main className="container">
      <h1>ログイン</h1>
      <p className="muted">
        モック版のため、会員を選ぶだけでログインできます(本実装ではコミュニティのアカウント連携に差し替え)。
      </p>
      {error && (
        <div className="notice error">{errorMessages[error] ?? "エラーが発生しました"}</div>
      )}
      <div className="card">
        <table className="data">
          <thead>
            <tr>
              <th>表示名</th>
              <th>区分</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((m) => (
              <tr key={m.id}>
                <td>{m.display_name}</td>
                <td>{m.role === "admin" ? "運営者" : "会員"}</td>
                <td>
                  <form action={loginAction}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <button type="submit" className="small">
                      このユーザーでログイン
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
