import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireMember } from "@/lib/auth/session";
import { getMyTicket } from "@/lib/tickets";
import { formatJst } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireMember();
  const { id } = await params;
  const ticket = await getMyTicket(id, member.id);
  if (!ticket) notFound();

  const invalid = !!ticket.revoked_at || ticket.application_status === "cancelled";
  const qrDataUrl = await QRCode.toDataURL(ticket.token, { width: 520, margin: 1 });

  return (
    <main className="container">
      <div className="ticket card">
        <h1 style={{ marginBottom: 4 }}>{ticket.title}</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {formatJst(ticket.starts_at)}
          <br />
          {ticket.venue}
        </p>
        {invalid ? (
          <div className="notice error">
            このチケットはキャンセルにより無効化されています。
          </div>
        ) : (
          <>
            {/* QR は照合トークンのみを含む。受付でスキャンして入場 */}
            <img src={qrDataUrl} alt="入場QRコード" className="qr" />
            <p className="name">{ticket.display_name} 様</p>
            {ticket.checked_in_at && (
              <p className="muted">入場済み: {formatJst(ticket.checked_in_at)}</p>
            )}
            <p className="muted">受付でこの画面をご提示ください</p>
          </>
        )}
      </div>
    </main>
  );
}
