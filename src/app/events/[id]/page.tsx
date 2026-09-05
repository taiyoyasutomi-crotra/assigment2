// 会員向けの申込ページ。ログイン不要(2026-09-05 顧客要望):
// Googleフォームと同じく、リンクを開いて入力するだけで申込できる。
// 結果は当選者にメールで連絡し、申込完了時に発行される確認ページでも確認できる。
import { notFound } from "next/navigation";
import { getEvent, effectiveStatus, memberStatusLabel } from "@/lib/events";
import { formatJst } from "@/lib/format";
import { ApplyForm } from "@/components/ApplyForm";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await getEvent(id);
  if (!event || event.status === "draft") notFound();

  const open = effectiveStatus(event) === "open";

  return (
    <main className="container">
      <h1>
        {event.title}{" "}
        <span className="badge neutral">{memberStatusLabel(event)}</span>
      </h1>
      <div className="card">
        <p>
          日時: {formatJst(event.starts_at)}
          <br />
          会場: {event.venue}
          <br />
          定員: {event.capacity}名(先着順。定員を超えた分は申込順の繰上待ちになります)
          <br />
          申込締切: {formatJst(event.closes_at)}
        </p>
        {event.description && (
          <p style={{ whiteSpace: "pre-wrap" }}>{event.description}</p>
        )}
      </div>

      {open ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>参加申込</h2>
          <p className="muted">
            ログインは不要です。締切後、申込順に当選が確定し、当選された方には
            メールでご連絡します(入場QRコード付き)。
            申込完了時に表示される確認ページで、結果の確認とキャンセルができます。
          </p>
          <ApplyForm eventId={event.id} />
        </div>
      ) : (
        <div className="notice info">このイベントの募集は締め切られています。</div>
      )}
    </main>
  );
}
