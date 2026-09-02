import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listMyApplications } from "@/lib/applications";
import { PROMOTION_DEADLINE_HOURS } from "@/lib/config";
import { formatJst } from "@/lib/format";

export const dynamic = "force-dynamic";

// 会員向けの表示は「当選 / 抽選中 / 終了」の3つに簡素化する(顧客指示 2026-09-02)。
// 待機順位や落選などの内部状態は見せない(繰上の可能性がある間は「抽選中」のまま)
function statusView(app: {
  status: string;
  waitlist_order: number | null;
  starts_at: Date;
  event_status: string;
}): { label: string; badge: string } {
  switch (app.status) {
    case "won":
      return { label: "当選", badge: "won" };
    case "applied":
      return { label: "抽選中", badge: "applied" };
    case "waitlisted": {
      // 繰上締切(開始2時間前)を過ぎたら繰上の可能性はないため終了表示にする
      const deadline =
        new Date(app.starts_at).getTime() - PROMOTION_DEADLINE_HOURS * 3600 * 1000;
      if (Date.now() > deadline) return { label: "終了", badge: "finished" };
      return { label: "抽選中", badge: "applied" };
    }
    case "lost":
      return { label: "終了", badge: "finished" };
    case "cancelled":
      return { label: "キャンセル", badge: "cancelled" };
    default:
      return { label: "終了", badge: "finished" };
  }
}

export default async function MyPage() {
  const member = await requireMember();
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
    </main>
  );
}
