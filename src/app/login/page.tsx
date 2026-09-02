import Link from "next/link";
import { redirect } from "next/navigation";
import { authProvider } from "@/lib/auth/provider";
import { authMode } from "@/lib/auth/fansCode";
import { getSessionMember } from "@/lib/auth/session";
import {
  loginAction,
  passwordLoginAction,
  requestResetAction,
  requestSignupAction,
} from "./actions";

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
  invalid_credentials: "メールアドレスまたはパスワードが正しくありません",
  password_not_set:
    "このアカウントはパスワードが未設定です。「パスワードを忘れた場合」から設定してください",
  weak_password: "パスワードは8文字以上にしてください",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; tab?: string }>;
}) {
  const { error, sent, tab } = await searchParams;
  const mode = authMode();

  // ログイン済みならログイン画面を出さず、そのまま中へ
  const current = await getSessionMember();
  if (current) redirect(current.role === "admin" ? "/admin/events" : "/");

  if (mode === "fans_code") {
    const view = tab === "signup" ? "signup" : tab === "link" ? "link" : "login";
    return (
      <main className="container">
        <h1>{view === "signup" ? "アカウント作成" : "ログイン"}</h1>
        <div className="tab-row">
          <Link href="/login" className={`tab ${view === "login" ? "active" : ""}`}>
            ログイン
          </Link>
          <Link
            href="/login?tab=signup"
            className={`tab ${view === "signup" ? "active" : ""}`}
          >
            アカウント作成
          </Link>
        </div>
        {error && (
          <div className="notice error">{errorMessages[error] ?? "エラーが発生しました"}</div>
        )}
        {sent ? (
          <div className="notice success">
            {view === "signup"
              ? "アカウント登録用のリンクをメールで送信しました(有効期限15分)。リンクを開くと登録が完了します。"
              : "パスワード再設定用のリンクをメールで送信しました(有効期限15分)。リンクを開いて新しいパスワードを設定してください。"}
            届かない場合は迷惑メールフォルダもご確認ください。
          </div>
        ) : view === "signup" ? (
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
              <label className="field">
                パスワード(8文字以上)
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              <button type="submit">登録用リンクを送る</button>
            </form>
          </div>
        ) : view === "link" ? (
          <div className="card">
            <p className="muted">
              登録済みのメールアドレスにパスワード再設定用のリンクをお送りします
              (パスワードを忘れた場合・未設定の場合はこちら)。
            </p>
            <form action={requestResetAction} className="stack">
              <label className="field">
                メールアドレス
                <input type="email" name="email" required placeholder="you@example.com" />
              </label>
              <button type="submit">再設定リンクを送る</button>
            </form>
            <p className="muted" style={{ marginBottom: 0 }}>
              <Link href="/login">← パスワードでログイン</Link>
            </p>
          </div>
        ) : (
          <div className="card">
            <form action={passwordLoginAction} className="stack">
              <label className="field">
                メールアドレス
                <input type="email" name="email" required placeholder="you@example.com" />
              </label>
              <label className="field">
                パスワード
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <button type="submit">ログイン</button>
            </form>
            <p className="muted" style={{ marginBottom: 0 }}>
              <Link href="/login?tab=link">パスワードを忘れた場合(再設定)</Link>
            </p>
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
