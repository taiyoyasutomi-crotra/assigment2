import Link from "next/link";
import { redirect } from "next/navigation";
import { authProvider } from "@/lib/auth/provider";
import { authMode } from "@/lib/auth/fansCode";
import { getSessionMember, roleHome } from "@/lib/auth/session";
import {
  loginAction,
  passwordLoginAction,
  requestResetAction,
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
  // (担当イベントのない受付アカウントだけは行き先がないため、ログイン画面に留める)
  const current = await getSessionMember();
  if (current && roleHome(current) !== "/login") redirect(roleHome(current));

  if (mode === "fans_code") {
    const view = tab === "link" ? "link" : "login";
    return (
      <main className="container">
        <h1>運営者・受付担当のログイン</h1>
        <p className="muted">
          会員のみなさまはログイン不要です。イベントへの申込は、募集投稿に記載の
          申込フォームからどうぞ。
        </p>
        {error && (
          <div className="notice error">{errorMessages[error] ?? "エラーが発生しました"}</div>
        )}
        {sent ? (
          <div className="notice success">
            パスワード再設定用のリンクをメールで送信しました(有効期限15分)。
            リンクを開いて新しいパスワードを設定してください。
            届かない場合は迷惑メールフォルダもご確認ください。
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

  // 会員はログイン不要のため、選択肢は運営者・受付アカウントのみ
  const candidates = (await authProvider.listLoginCandidates()).filter(
    (m) => m.role !== "member"
  );
  return (
    <main className="container">
      <h1>運営者・受付担当のログイン</h1>
      <p className="muted">
        会員のみなさまはログイン不要です(申込は申込フォームからどうぞ)。
        モック版のため、ユーザーを選ぶだけでログインできます。
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
                <td>
                  {m.role === "admin" ? "運営者" : m.role === "checkin" ? "受付" : "会員"}
                </td>
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
