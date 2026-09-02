import Link from "next/link";
import { redirect } from "next/navigation";
import { authMode, peekResetToken } from "@/lib/auth/fansCode";
import { resetPasswordAction } from "./actions";

export const dynamic = "force-dynamic";

// パスワード再設定メールのリンク先。トークンが有効なら新パスワードの入力画面を出す
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  if (authMode() !== "fans_code") redirect("/login");
  const { token, error } = await searchParams;
  const valid = token ? await peekResetToken(token) : null;

  return (
    <main className="container">
      <h1>パスワード再設定</h1>
      {!valid ? (
        <>
          <div className="notice error">
            このリンクは無効か、有効期限(15分)が切れています。
          </div>
          <p>
            <Link href="/login?tab=link">再設定リンクを送り直す</Link>
          </p>
        </>
      ) : (
        <>
          {error === "weak_password" && (
            <div className="notice error">パスワードは8文字以上にしてください。</div>
          )}
          <div className="card">
            <p className="muted">
              {valid.email} の新しいパスワードを設定します。設定後はそのままログインします。
            </p>
            <form action={resetPasswordAction} className="stack">
              <input type="hidden" name="token" value={token} />
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
              <button type="submit">パスワードを設定してログイン</button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
