"use server";

// 申込状況ページ(/a/<token>)からの申込者自身によるキャンセル。
// トークンが一致する申込だけを操作できる(ログインは不要)。
import { redirect } from "next/navigation";
import { getApplicationByToken } from "@/lib/applications";
import { executeCancel, withdrawApplication } from "@/lib/cancel";

export async function selfCancelAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const app = await getApplicationByToken(token);
  if (!app) redirect("/");

  // 当選はチケット無効化+繰上を伴うキャンセル、選定前・待機は取消のみ
  const result =
    app.status === "won"
      ? await executeCancel(app.id)
      : await withdrawApplication(app.id);
  if (!result.ok) {
    redirect(`/a/${token}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/a/${token}?cancelled=1`);
}
