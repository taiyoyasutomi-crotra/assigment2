// 申込状況ページ。申込完了時に発行される本人専用URL(/a/<token>)。
// ログイン不要で、結果の確認・入場QRの表示・キャンセルができる。
// 当選連絡はメールでも届くが、メールを見失った場合の受け皿もここ。
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getApplicationByToken } from "@/lib/applications";
import { formatJst } from "@/lib/format";
import { appUrl } from "@/lib/config";
import { CopyButton } from "@/components/CopyButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { selfCancelAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApplicationStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string; cancelled?: string; error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const app = await getApplicationByToken(token);
  if (!app) notFound();

  const url = `${appUrl()}/a/${token}`;
  const eventFinished =
    app.event_status === "finished" ||
    (app.ends_at != null && new Date(app.ends_at) < new Date());
  const closed = new Date(app.closes_at) <= new Date();
  const canCancel =
    !eventFinished &&
    (app.status === "applied" || app.status === "waitlisted" || app.status === "won");

  const statusView: Record<string, { label: string; badge: string }> = {
    applied: { label: "受付済み(結果待ち)", badge: "applied" },
    won: { label: "当選🎉", badge: "won" },
    waitlisted: { label: "繰上待ち(待機)", badge: "waitlisted" },
    lost: { label: "落選", badge: "lost" },
    cancelled: { label: "キャンセル済み", badge: "cancelled" },
  };
  const s = statusView[app.status] ?? { label: app.status, badge: "neutral" };

  const showQr = app.status === "won" && app.ticket_token && !eventFinished;
  const qrDataUrl = showQr
    ? await QRCode.toDataURL(app.ticket_token!, { width: 520, margin: 1 })
    : null;

  return (
    <main className="container">
      {sp.new && (
        <div className="notice success">
          申込が完了しました🎉 <strong>このページのURLをブックマーク・保存してください。</strong>
          結果の確認・キャンセル・当日の入場QRコードの表示に使います。
        </div>
      )}
      {sp.cancelled && (
        <div className="notice success">
          参加をキャンセルしました。またのお申し込みをお待ちしています。
        </div>
      )}
      {sp.error && <div className="notice error">{sp.error}</div>}

      <h1>
        申込状況 <span className={`badge ${s.badge}`}>{s.label}</span>
      </h1>

      <div className="card">
        <p>
          イベント: <strong>{app.title}</strong>
          <br />
          日時: {formatJst(app.starts_at)}
          <br />
          会場: {app.venue}
        </p>
        <p className="muted">
          お名前: {app.applicant_name}
          {app.nickname && <>({app.nickname})</>} / メール: {app.email} / 申込日時:{" "}
          {formatJst(app.applied_at)}
        </p>
        <div>
          <CopyButton text={url} label="このページのURLをコピー" />
        </div>
      </div>

      {app.status === "applied" && (
        <div className="notice info">
          お申し込みを受け付けています。
          {closed
            ? "募集は締め切られました。結果の確定をお待ちください。"
            : "先着順のため、締切後に申込順で当選が確定します。"}
          当選された方にはメールでご連絡します(入場QRコード付き)。このページでも確認できます。
        </div>
      )}
      {app.status === "waitlisted" && (
        <div className="notice info">
          現在、繰上待ち{app.waitlist_order != null && <>(待機{app.waitlist_order}位)</>}
          です。キャンセルが出た場合、申込順に繰り上げて当選のご連絡をメールでお送りします。
        </div>
      )}
      {app.status === "lost" && (
        <div className="notice info">
          今回はご参加いただけませんでした。またのお申し込みをお待ちしています。
        </div>
      )}

      {showQr && (
        <div className="ticket card">
          <h2 style={{ marginTop: 0 }}>入場QRコード</h2>
          {/* QR は照合トークンのみを含む。受付でスキャンして入場 */}
          <img src={qrDataUrl!} alt="入場QRコード" className="qr" />
          <p className="name">{app.applicant_name} 様</p>
          {app.checked_in_at ? (
            <p className="muted">入場済み: {formatJst(app.checked_in_at)}</p>
          ) : (
            <p className="muted">当日は受付でこの画面(またはメール添付のQR)をご提示ください</p>
          )}
        </div>
      )}

      {canCancel && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>参加のキャンセル</h2>
          <p className="muted">
            キャンセルは取り消せません。
            {app.status === "won" &&
              "キャンセルすると入場QRコードは無効になり、繰上待ちの方への連絡が行われます。"}
          </p>
          <form action={selfCancelAction}>
            <input type="hidden" name="token" value={token} />
            <ConfirmSubmitButton
              className="danger"
              message={`「${app.title}」への参加をキャンセルします。元に戻せません。よろしいですか?`}
            >
              参加をキャンセルする
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </main>
  );
}
