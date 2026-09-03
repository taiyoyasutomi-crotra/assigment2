"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  createEvent,
  finishEvent,
  deleteEvent,
  updateEventSettings,
  updateDraftEvent,
  publishEvent,
} from "@/lib/events";
import { parseJstLocal } from "@/lib/format";
import { approveApplicationEmail, deleteApplication } from "@/lib/applications";
import { runSelection } from "@/lib/selection";
import { previewCancel, executeCancel, type CancelPreview, type CancelResult } from "@/lib/cancel";

export async function createEventAction(formData: FormData) {
  await requireAdmin();
  // 「一時保存」ボタンからの送信は下書き(作成中)として保存する
  const draft = formData.get("mode") === "draft";
  const result = await createEvent({
    title: String(formData.get("title") || ""),
    startsAt: parseJstLocal(String(formData.get("startsAt") || "")),
    venue: String(formData.get("venue") || ""),
    description: String(formData.get("description") || ""),
    capacity: Number(formData.get("capacity")),
    closesAt: parseJstLocal(String(formData.get("closesAt") || "")),
    draft,
  });
  if ("error" in result) {
    redirect(`/admin/events?tab=new&error=${encodeURIComponent(result.error)}`);
  }
  if (draft) {
    redirect(`/admin/events?tab=draft&saved=1`);
  }
  // 作成した瞬間に会員向けの申込ページが生える(F1)
  redirect(`/admin/events/${result.id}?created=1`);
}

/** 下書き(作成中)の編集を保存 */
export async function updateDraftAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  const result = await updateDraftEvent(eventId, {
    title: String(formData.get("title") || ""),
    startsAt: parseJstLocal(String(formData.get("startsAt") || "")),
    venue: String(formData.get("venue") || ""),
    description: String(formData.get("description") || ""),
    capacity: Number(formData.get("capacity")),
    closesAt: parseJstLocal(String(formData.get("closesAt") || "")),
  });
  if (!result.ok) {
    redirect(`/admin/events/${eventId}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/admin/events/${eventId}?updated=1`);
}

/** 下書き(作成中)を公開して募集開始 */
export async function publishEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  const result = await publishEvent(eventId);
  if (!result.ok) {
    redirect(`/admin/events/${eventId}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/admin/events/${eventId}?created=1`);
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
    `/admin/events/${eventId}?selected=${result.winners}&waitlisted=${result.waitlisted}&excluded=${result.excluded}`
  );
}

/** 手動でイベントを完了にする(一覧の「終了したイベント」へ移す) */
export async function finishEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  await finishEvent(eventId);
  redirect(`/admin/events/${eventId}?finished=1`);
}

/** イベントを削除する(申込・チケット・通知履歴ごと。取り消し不可) */
export async function deleteEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  await deleteEvent(eventId);
  redirect("/admin/events?deleted=1");
}

/** 定員(当選人数)・申込締切・概要の変更 */
export async function updateEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  const result = await updateEventSettings(eventId, {
    capacity: Number(formData.get("capacity")),
    closesAt: parseJstLocal(String(formData.get("closesAt") || "")),
    description: String(formData.get("description") || ""),
  });
  if (!result.ok) {
    redirect(`/admin/events/${eventId}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/admin/events/${eventId}?updated=1`);
}

/** 名簿外申込の承認: メールアドレスを会員名簿に追加し、選定対象にする */
export async function approveApplicationAction(formData: FormData) {
  await requireAdmin();
  const applicationId = String(formData.get("applicationId") || "");
  const eventId = String(formData.get("eventId") || "");
  await approveApplicationEmail(applicationId);
  redirect(`/admin/events/${eventId}?approved=1`);
}

/** 名簿外申込の削除 */
export async function deleteApplicationAction(formData: FormData) {
  await requireAdmin();
  const applicationId = String(formData.get("applicationId") || "");
  const eventId = String(formData.get("eventId") || "");
  await deleteApplication(applicationId);
  redirect(`/admin/events/${eventId}?app_deleted=1`);
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
