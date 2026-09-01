import { authProvider } from "@/lib/auth/provider";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const candidates = await authProvider.listLoginCandidates();
  return (
    <main className="container">
      <h1>ログイン</h1>
      <p className="muted">
        モック版のため、会員を選ぶだけでログインできます(本実装ではコミュニティのアカウント連携に差し替え)。
      </p>
      {error && <div className="notice error">ログインに失敗しました</div>}
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
