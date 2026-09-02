import Link from "next/link";
import { authProvider } from "@/lib/auth/provider";
import { authMode } from "@/lib/auth/fansCode";
import { loginAction, requestLoginLinkAction, requestSignupAction } from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  "1": "ログインに失敗しました",
  invalid_email: "メールアドレスの形式が正しくありません",
  send_failed: "メールの送信に失敗しました。時間をおいて再度お試しください",
  invalid_link: "ログインリンクが無効か、有効期限(15分)が切れています。もう一度お試しください",
  not_registered:
    "このメールアドレスは登録されていません。「アカウント作成」からご登録ください",
  already_registered:
    "このメールアドレスは登録済みです。「ログイン」からお進みください",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; tab?: string }>;
}) {
  const { error, sent, tab } = await searchParams;
  const mode = authMode();

  if (mode === "fans_code") {
    const isSignup = tab === "signup";
    return (
      <main className="container">
        <h1>{isSignup ? "アカウント作成" : "ログイン"}</h1>
        <div className="tab-row">
          <Link href="/login" className={`tab ${!isSignup ? "active" : ""}`}>
            ログイン
          </Link>
          <Link href="/login?tab=signup" className={`tab ${isSignup ? "active" : ""}`}>
            アカウント作成
          </Link>
        </div>
        {error && (
          <div className="notice error">{errorMessages[error] ?? "エラーが発生しました"}</div>
        )}
        {sent ? (
          <div className="notice success">
            {isSignup
              ? "アカウント登録用のリンクをメールで送信しました(有効期限15分)。リンクを開くと登録が完了します。"
              : "ログインリンクをメールで送信しました(有効期限15分)。メールをご確認ください。"}
            届かない場合は迷惑メールフォルダもご確認ください。
          </div>
        ) : isSignup ? (
          <div className="card">
            <p className="muted">
              メールアドレス宛に確認リンクをお送りします。リンクを開くと登録完了です。
            </p>
            <form action={requestSignupAction} className="stack">
              <label className="field">
                表示名
                <input type="text" name="displayName" required placeholder="ニックネーム" />
              </label>
              <label className="field">
                メールアドレス
                <input type="email" name="email" required placeholder="you@example.com" />
              </label>
              <button type="submit">登録用リンクを送る</button>
            </form>
          </div>
        ) : (
          <div className="card">
            <p className="muted">
              登録済みのメールアドレスを入力してください。ログイン用のリンクをお送りします。
            </p>
            <form action={requestLoginLinkAction} className="stack">
              <label className="field">
                メールアドレス
                <input type="email" name="email" required placeholder="you@example.com" />
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
        <div className="table-scroll">
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
      </div>
    </main>
  );
}
