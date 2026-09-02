import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { authMode } from "@/lib/auth/fansCode";
import { listMyApplications } from "@/lib/applications";
import { PROMOTION_DEADLINE_HOURS } from "@/lib/config";
import { formatJst } from "@/lib/format";
import { setPasswordAction } from "./actions";

export const dynamic = "force-dynamic";

function statusView(app: {
  status: string;
  waitlist_order: number | null;
  starts_at: Date;
  event_status: string;
}): { label: string; badge: string } {
  switch (app.status) {
    case "applied":
      return { label: "抽選待ち", badge: "applied" };
    case "won":
      return { label: "当選", badge: "won" };
    case "waitlisted": {
      // 繰上締切(開始2時間前)を過ぎたら繰上の可能性はないため落選表示にする
      const deadline =
        new Date(app.starts_at).getTime() - PROMOTION_DEADLINE_HOURS * 3600 * 1000;
      if (Date.now() > deadline) return { label: "落選", badge: "lost" };
      return {
        label: `待機中(${app.waitlist_order ?? "-"}番目)`,
        badge: "waitlisted",
      };
    }
    case "lost":
      return { label: "落選", badge: "lost" };
    case "cancelled":
      return { label: "キャンセル", badge: "cancelled" };
    default:
      return { label: app.status, badge: "neutral" };
  }
}

export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ password_updated?: string; error?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const applications = await listMyApplications(member.id);
  return (
    <main className="container">
      <h1>自分の申込状況</h1>
      {applications.length === 0 && (
        <p className="muted">
          申込はまだありません。<Link href="/">イベント一覧</Link>からお申し込みください。
        </p>
      )}
      {applications.length > 0 && (
        <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>イベント</th>
              <th>日時</th>
              <th>申込日</th>
              <th>状況</th>
              <th>チケット</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => {
              const view = statusView(a);
              return (
                <tr key={a.id}>
                  <td>
                    <Link href={`/events/${a.event_id}`}>{a.title}</Link>
                  </td>
                  <td>{formatJst(a.starts_at)}</td>
                  <td>{formatJst(a.applied_at)}</td>
                  <td>
                    <span className={`badge ${view.badge}`}>{view.label}</span>
                  </td>
                  <td>
                    {a.status === "won" && a.ticket_id ? (
                      <Link href={`/my/tickets/${a.ticket_id}`}>表示する</Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

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
            <p className="muted">
              ログインに使うパスワードを設定・変更できます。
            </p>
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
