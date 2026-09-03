"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { executeCancel, withdrawApplication } from "@/lib/cancel";

/**
 * 会員自身によるキャンセル(マイページから)。
 * - 抽選中(applied)・待機(waitlisted): 申込の取消
 * - 当選(won): キャンセル+チケット無効化+待機1位の繰上(運営者のキャンセルと同じ処理)
 * 本人の申込であることをサーバー側で必ず確認する。
 */
export async function selfCancelAction(formData: FormData) {
  const member = await requireMember();
  const applicationId = String(formData.get("applicationId") || "");

  const rows = await query<{ id: string; member_id: string; status: string }>(
    "select id, member_id, status from applications where id = $1",
    [applicationId]
  );
  const app = rows[0];
  if (!app || app.member_id !== member.id) {
    redirect(`/my?error=${encodeURIComponent("対象の申込が見つかりません")}`);
  }

  if (app.status === "won") {
    const result = await executeCancel(applicationId);
    if (!result.ok) {
      redirect(`/my?error=${encodeURIComponent(result.error)}`);
    }
    redirect("/my?cancelled=won");
  }

  const result = await withdrawApplication(applicationId, member.id);
  if (!result.ok) {
    redirect(`/my?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/my?cancelled=1");
}
