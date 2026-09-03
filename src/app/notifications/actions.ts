"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import {
  deleteMyNotification,
  markNotificationRead,
} from "@/lib/notify/notifications";

/** お知らせの削除(本人のもののみ。運営側の通知履歴には残る) */
export async function deleteNotificationAction(formData: FormData) {
  const member = await requireMember();
  const notificationId = String(formData.get("notificationId") || "");
  await deleteMyNotification(notificationId, member.id);
  // ヘッダーの未読バッジも更新されるようレイアウトごと再検証する
  revalidatePath("/", "layout");
  redirect("/notifications?deleted=1");
}

/**
 * お知らせ1件を既読にする(件名をタップして本文を開いたときにクライアントから呼ばれる)。
 * ヘッダーの未読バッジはレイアウトが描画しており、ページ遷移では
 * レイアウトが再描画されないため、レイアウトごと再検証してバッジを更新する
 */
export async function markOneNotificationReadAction(notificationId: string) {
  const member = await requireMember();
  await markNotificationRead(notificationId, member.id);
  revalidatePath("/", "layout");
}
