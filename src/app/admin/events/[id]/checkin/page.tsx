import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getEvent } from "@/lib/events";
import { CheckinClient } from "@/components/CheckinClient";

export const dynamic = "force-dynamic";

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  return (
    <main className="container" style={{ maxWidth: 520 }}>
      <p>
        <Link href={`/admin/events/${event.id}`}>← イベント管理へ</Link>
      </p>
      <h1 style={{ textAlign: "center" }}>受付: {event.title}</h1>
      <CheckinClient eventId={event.id} />
    </main>
  );
}
