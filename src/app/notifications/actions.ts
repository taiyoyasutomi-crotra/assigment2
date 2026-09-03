"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { deleteMyNotification } from "@/lib/notify/notifications";

/** お知らせの削除(本人のもののみ。運営側の通知履歴には残る) */
export async function deleteNotificationAction(formData: FormData) {
  const member = await requireMember();
  const notificationId = String(formData.get("notificationId") || "");
  await deleteMyNotification(notificationId, member.id);
  redirect("/notifications?deleted=1");
}
