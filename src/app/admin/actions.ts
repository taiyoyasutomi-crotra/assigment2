"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { parseJstLocal } from "@/lib/format";
import { runSelection } from "@/lib/selection";
import { previewCancel, executeCancel, type CancelPreview, type CancelResult } from "@/lib/cancel";

export async function createEventAction(formData: FormData) {
  await requireAdmin();
  const result = await createEvent({
    title: String(formData.get("title") || ""),
    startsAt: parseJstLocal(String(formData.get("startsAt") || "")),
    venue: String(formData.get("venue") || ""),
    capacity: Number(formData.get("capacity")),
    applicationLimit: Number(formData.get("applicationLimit")),
    closesAt: parseJstLocal(String(formData.get("closesAt") || "")),
  });
  if ("error" in result) {
    redirect(`/admin/events?error=${encodeURIComponent(result.error)}`);
  }
  // 作成した瞬間に会員向けの申込ページが生える(F1)
  redirect(`/admin/events/${result.id}?created=1`);
}

/** 手動締切(F3)。確認ダイアログは画面側で1回挟む */
export async function closeEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  await query(
    "update events set status = 'closed' where id = $1 and status = 'open'",
    [eventId]
  );
  redirect(`/admin/events/${eventId}?closed=1`);
}

export async function runSelectionAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  const result = await runSelection(eventId);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "イベントが見つかりません",
      not_closed: "締切前は選定できません(先に募集を締め切ってください)",
      already_selected: "選定はすでに実行済みです(1イベント1回のみ)",
    };
    redirect(
      `/admin/events/${eventId}?error=${encodeURIComponent(messages[result.error])}`
    );
  }
  redirect(
    `/admin/events/${eventId}?selected=${result.winners}&waitlisted=${result.waitlisted}`
  );
}

/** キャンセル確認ダイアログ用(クライアントから呼ぶ) */
export async function previewCancelAction(
  applicationId: string
): Promise<CancelPreview> {
  await requireAdmin();
  return previewCancel(applicationId);
}

/** キャンセル実行(クライアントのダイアログで承認後に呼ぶ) */
export async function executeCancelAction(
  applicationId: string,
  eventId: string
): Promise<CancelResult> {
  await requireAdmin();
  const result = await executeCancel(applicationId);
  revalidatePath(`/admin/events/${eventId}`);
  return result;
}
