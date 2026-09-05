"use server";

import { redirect } from "next/navigation";
import { applyToEvent } from "@/lib/applications";

/**
 * 申込フォームの送信結果。入力ミスはリダイレクトせず、入力値と
 * 項目別エラーをフォームに返す(該当欄だけ強調し、入力し直しを不要にする)。
 * 成功時は申込状況ページ(/a/<token>)へ遷移する。null = 未送信
 */
export type ApplyFormState = {
  fieldErrors: Partial<Record<"name" | "nickname" | "email" | "emailConfirm", string>>;
  values: Record<string, string>;
  /** 項目に紐付かないエラー(締切済み等) */
  error?: string;
} | null;

export async function submitApplyAction(
  _prev: ApplyFormState,
  formData: FormData
): Promise<ApplyFormState> {
  const eventId = String(formData.get("eventId") || "");
  const values = Object.fromEntries(
    ["name", "nickname", "email", "emailConfirm"].map((k) => [
      k,
      String(formData.get(k) ?? ""),
    ])
  );

  const fieldErrors: NonNullable<ApplyFormState>["fieldErrors"] = {};
  if (!values.name.trim()) fieldErrors.name = "お名前を入力してください";
  if (!values.nickname.trim())
    fieldErrors.nickname = "サロンのニックネームを入力してください";
  if (!values.email.trim()) fieldErrors.email = "メールアドレスを入力してください";
  // 打ち間違い対策: 2回入力の一致をサーバー側でも確認する
  if (values.email.trim() !== values.emailConfirm.trim()) {
    fieldErrors.emailConfirm = "メールアドレスが一致しません";
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  const result = await applyToEvent(eventId, {
    name: values.name,
    nickname: values.nickname,
    email: values.email,
  });
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "イベントが見つかりません",
      closed: "募集は締め切られました",
      invalid_name: "お名前を入力してください",
      invalid_email: "メールアドレスの形式が正しくありません",
      duplicate_email:
        "このメールアドレスは、このイベントで既に申込済みです。申込内容は申込完了時に表示された確認ページからご確認ください",
    };
    if (result.error === "invalid_email") {
      return { fieldErrors: { email: messages.invalid_email }, values };
    }
    return { fieldErrors: {}, values, error: messages[result.error] };
  }

  // 申込完了: 本人専用の申込状況ページへ(ブックマークしてもらう)
  redirect(`/a/${result.token}?new=1`);
}
