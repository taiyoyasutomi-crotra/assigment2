import { requireMember } from "@/lib/auth/session";
import { authMode } from "@/lib/auth/fansCode";
import { setPasswordAction } from "./actions";

export const dynamic = "force-dynamic";

// アカウント管理(会員・運営者共通)。自分のログイン情報をここで扱う
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ password_updated?: string; error?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  return (
    <main className="container">
      <h1>アカウント</h1>
      <div className="card">
        <p style={{ margin: 0 }}>
          表示名: <strong>{member.display_name}</strong>
          {member.role === "admin" && (
            <>
              {" "}
              <span className="badge selected">運営者</span>
            </>
          )}
          <br />
          メールアドレス: {member.email}
        </p>
      </div>

      {authMode() === "fans_code" && (
        <>
          <h2>パスワード</h2>
          {sp.password_updated && (
            <div className="notice success">パスワードを変更しました。</div>
          )}
          {sp.error === "weak_password" && (
            <div className="notice error">パスワードは8文字以上にしてください。</div>
          )}
          <div className="card">
            <p className="muted">ログインに使うパスワードを設定・変更できます。</p>
            <form action={setPasswordAction} className="stack">
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
    </main>
  );
}
