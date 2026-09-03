import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listMyApplications } from "@/lib/applications";
import { PROMOTION_DEADLINE_HOURS } from "@/lib/config";
import { formatJst } from "@/lib/format";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { selfCancelAction } from "./actions";

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

export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; error?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const applications = await listMyApplications(member.id);
  return (
    <main className="container">
      <h1>自分の申込状況</h1>
      {sp.cancelled === "won" && (
        <div className="notice success">
          参加をキャンセルしました。チケットは無効になっています。
        </div>
      )}
      {sp.cancelled === "1" && (
        <div className="notice success">申込を取り消しました。</div>
      )}
      {sp.error && <div className="notice error">{sp.error}</div>}
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => {
              const view = statusView(a);
              // キャンセル可能な条件: 開催前のイベントで、
              // - 抽選中(applied/waitlisted) → 申込の取消
              // - 当選(won) → 参加キャンセル(チケット無効化・繰上が発生する)
              const upcoming =
                new Date(a.starts_at) > new Date() && a.event_status !== "finished";
              const canWithdraw =
                upcoming && (a.status === "applied" || a.status === "waitlisted");
              const canCancelWin = upcoming && a.status === "won";
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
                  <td>
                    {canWithdraw && (
                      <form action={selfCancelAction}>
                        <input type="hidden" name="applicationId" value={a.id} />
                        <ConfirmSubmitButton
                          className="secondary small"
                          message={`「${a.title}」の申込を取り消します。よろしいですか?`}
                        >
                          申込を取り消す
                        </ConfirmSubmitButton>
                      </form>
                    )}
                    {canCancelWin && (
                      <form action={selfCancelAction}>
                        <input type="hidden" name="applicationId" value={a.id} />
                        <ConfirmSubmitButton
                          className="danger small"
                          message={`「${a.title}」への参加をキャンセルします。入場チケットは無効になり、元に戻せません。よろしいですか?`}
                        >
                          参加をキャンセル
                        </ConfirmSubmitButton>
                      </form>
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
