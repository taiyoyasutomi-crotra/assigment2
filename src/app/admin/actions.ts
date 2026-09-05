"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  createEvent,
  finishEvent,
  restoreEvent,
  deleteEvent,
  updateEventSettings,
  updateDraftEvent,
  publishEvent,
  getEvent,
  updateAnnounceText,
  updateWinMessage,
} from "@/lib/events";
import {
  validateEventFields,
  type EventFieldErrors,
} from "@/lib/eventValidation";
import { buildAnnouncement } from "@/lib/announce";
import { defaultWinMessage } from "@/lib/mail";
import { parseJstLocal } from "@/lib/format";

import { effectiveStatus, isFinished } from "@/lib/events";
import { approveApplicationEmail, deleteApplication } from "@/lib/applications";
import { runSelection } from "@/lib/selection";
import { processNotificationQueue } from "@/lib/notify/notifications";
import { previewCancel, executeCancel, type CancelPreview, type CancelResult } from "@/lib/cancel";

/**
 * イベントフォーム(新規作成・下書き編集・設定変更)の送信結果。
 * 入力ミスがあってもリダイレクトせず、入力値と項目別エラーをフォームに返す。
 * 該当欄だけ強調表示し、入力し直しを不要にする。null = 未送信
 */
export type EventFormState = {
  fieldErrors: EventFieldErrors;
  /** 送信された入力値。フォームに残して再入力を不要にする */
  values: Record<string, string>;
  /** 項目に紐付かないエラー(イベントが見つからない等) */
  error?: string;
} | null;

export async function submitEventFormAction(
  _prev: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  await requireAdmin();
  const variant = String(formData.get("variant") || "");
  const eventId = String(formData.get("eventId") || "");
  const values = Object.fromEntries(
    [
      "title",
      "startsAt",
      "venue",
      "publicVenue",
      "description",
      "capacity",
      "closesAt",
      "endsAt",
    ].map((k) => [k, String(formData.get(k) ?? "")])
  );

  const input = {
    title: values.title,
    startsAt: parseJstLocal(values.startsAt),
    venue: values.venue,
    publicVenue: values.publicVenue,
    description: values.description,
    capacity: Number(values.capacity || NaN),
    closesAt: parseJstLocal(values.closesAt),
    endsAt: values.endsAt ? parseJstLocal(values.endsAt) : null,
  };
  const fieldErrors = validateEventFields(
    // イベント設定の変更にはイベント名の欄がない
    variant === "settings" ? { ...input, title: undefined } : input
  );
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  if (variant === "create") {
    // 「一時保存」ボタンからの送信は下書き(作成中)として保存する
    const draft = formData.get("mode") === "draft";
    const result = await createEvent({ ...input, draft });
    if ("error" in result) return { fieldErrors: {}, values, error: result.error };
    if (draft) redirect(`/admin/events?tab=draft&saved=1`);
    // 作成した瞬間に会員向けの申込ページが生える(F1)
    redirect(`/admin/events/${result.id}?created=1`);
  }
  if (variant === "draft") {
    const result = await updateDraftEvent(eventId, input);
    if (!result.ok) return { fieldErrors: {}, values, error: result.error };
    redirect(`/admin/events/${eventId}?updated=1`);
  }
  if (variant === "settings") {
    const result = await updateEventSettings(eventId, input);
    if (!result.ok) return { fieldErrors: {}, values, error: result.error };
    redirect(`/admin/events/${eventId}?updated=1`);
  }
  return { fieldErrors: {}, values, error: "不正なフォームです" };
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

/** 再募集: 新しい申込締切を設定して募集中に戻す(締切後・選定前のみ) */
export async function reopenEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  const errUrl = (message: string) =>
    `/admin/events/${eventId}?error=${encodeURIComponent(message)}`;

  const event = await getEvent(eventId);
  if (!event) redirect(errUrl("イベントが見つかりません"));
  if (isFinished(event) || effectiveStatus(event) !== "closed") {
    redirect(errUrl("再募集は締切後・選定前のイベントのみ可能です"));
  }
  const closesAt = parseJstLocal(String(formData.get("closesAt") || ""));
  if (isNaN(closesAt.getTime())) redirect(errUrl("新しい申込締切を入力してください"));
  if (closesAt <= new Date()) redirect(errUrl("新しい申込締切は未来の日時にしてください"));
  if (closesAt >= new Date(event.starts_at)) {
    redirect(errUrl("申込締切はイベント開始より前にしてください"));
  }
  await query(
    `update events set closes_at = $2, status = 'open'
     where id = $1 and status in ('open', 'closed')`,
    [eventId, closesAt]
  );
  redirect(`/admin/events/${eventId}?reopened=1`);
}

/**
 * 送信待ちメールの手動送信。無料枠の1日予算の残りの範囲で優先度順に送る
 * (日次の Cron を待たずに流したいとき用)
 */
export async function processQueueAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  const r = await processNotificationQueue();
  redirect(
    `/admin/events/${eventId}?queue_sent=${r.sent}&queue_failed=${r.failed}&queue_remaining=${r.remaining}`
  );
}

/** 手動でイベントを完了にする(一覧の「終了したイベント」へ移す) */
export async function finishEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  await finishEvent(eventId);
  redirect(`/admin/events/${eventId}?finished=1`);
}

/** 完了したイベントの復元(手動完了の取り消し・自動完了の解除) */
export async function restoreEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  const result = await restoreEvent(eventId);
  if (!result.ok) {
    redirect(`/admin/events/${eventId}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/admin/events/${eventId}?restored=1`);
}

/** イベントを削除する(申込・チケット・通知履歴ごと。取り消し不可) */
export async function deleteEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  await deleteEvent(eventId);
  redirect("/admin/events?deleted=1");
}

/**
 * 告知文・当選連絡の文面の保存。
 * 空にした場合と自動生成そのままの場合は null で保存し、以後もイベント設定の
 * 変更(日時・会場など)が文面に追従する。編集して保存すると文面は固定される。
 */
export async function saveTemplateAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  const field = String(formData.get("field") || "");
  const text = String(formData.get("text") || "");
  const event = await getEvent(eventId);
  if (!event || (field !== "announce" && field !== "win")) {
    redirect(`/admin/events/${eventId}?error=${encodeURIComponent("保存できませんでした")}`);
  }
  const defaultText =
    field === "announce" ? buildAnnouncement(event) : defaultWinMessage(event);
  const value = !text.trim() || text.trim() === defaultText.trim() ? null : text;
  if (field === "announce") {
    await updateAnnounceText(eventId, value);
  } else {
    await updateWinMessage(eventId, value);
  }
  redirect(`/admin/events/${eventId}?template_saved=${field}`);
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
