"use client";

// 会員向けの申込フォーム(ログイン不要のアンケート方式)。
// 入力ミスがあってもページ遷移せず、入力値を残して該当欄だけ強調する。
// メールアドレスは打ち間違い対策で2回入力してもらい、不一致は入力中に警告する。
import { useActionState, useState } from "react";
import { submitApplyAction, type ApplyFormState } from "@/app/events/[id]/actions";

export function ApplyForm({ eventId }: { eventId: string }) {
  const [state, formAction] = useActionState<ApplyFormState, FormData>(
    submitApplyAction,
    null
  );
  const [mismatch, setMismatch] = useState(false);

  type Field = "name" | "nickname" | "email" | "emailConfirm";
  const value = (name: Field) => state?.values?.[name] ?? "";
  const err = (name: Field) =>
    (name === "emailConfirm" && mismatch
      ? "メールアドレスが一致しません"
      : undefined) ?? state?.fieldErrors?.[name];
  const fieldClass = (name: Field) => `field${err(name) ? " invalid" : ""}`;
  const msg = (name: Field) => {
    const m = err(name);
    return m && <span className="field-msg">⚠ {m}</span>;
  };

  const checkMismatch = (form: HTMLFormElement) => {
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value ?? "";
    const confirm =
      (form.elements.namedItem("emailConfirm") as HTMLInputElement)?.value ?? "";
    setMismatch(confirm !== "" && email !== confirm);
  };

  return (
    <form
      action={formAction}
      className="stack"
      onInput={(e) => checkMismatch(e.currentTarget)}
    >
      <input type="hidden" name="eventId" value={eventId} />
      {state?.error && <div className="notice error">{state.error}</div>}

      <label className={fieldClass("name")}>
        お名前(本名フルネーム。当日受付での確認に使います)
        <input
          type="text"
          name="name"
          required
          defaultValue={value("name")}
          placeholder="山田 花子"
        />
        {msg("name")}
      </label>
      <label className={fieldClass("nickname")}>
        サロンのニックネーム
        <input
          type="text"
          name="nickname"
          required
          defaultValue={value("nickname")}
          placeholder="はなちゃん"
        />
        {msg("nickname")}
      </label>
      <label className={fieldClass("email")}>
        メールアドレス(サロンに登録しているアドレス。当選のご連絡に使います)
        <input
          type="email"
          name="email"
          required
          defaultValue={value("email")}
          placeholder="you@example.com"
        />
        {msg("email")}
      </label>
      <label className={fieldClass("emailConfirm")}>
        メールアドレス(確認のためもう一度)
        <input
          type="email"
          name="emailConfirm"
          required
          defaultValue={value("emailConfirm")}
          placeholder="you@example.com"
        />
        {msg("emailConfirm")}
      </label>
      <button type="submit" disabled={mismatch}>
        このイベントに申し込む
      </button>
    </form>
  );
}
