"use client";

// イベントのフォーム(新規作成・下書き編集・設定変更)。
// 入力ミスがあってもページ遷移せず、入力値をそのまま残して
// 満たしていない項目だけを薄赤で強調し、そこだけ直せるようにする。
import { useActionState } from "react";
import { submitEventFormAction, type EventFormState } from "@/app/admin/actions";
import type { EventField } from "@/lib/events";

type Variant = "create" | "draft" | "settings";

export function EventForm({
  variant,
  eventId,
  initial = {},
}: {
  variant: Variant;
  eventId?: string;
  /** 編集フォームの初期値(datetime-local 形式の文字列)。新規作成では空 */
  initial?: Partial<Record<string, string>>;
}) {
  const [state, formAction] = useActionState<EventFormState, FormData>(
    submitEventFormAction,
    null
  );

  // エラーで戻ってきたときは送信した値を優先して欄に残す
  const value = (name: string) => state?.values?.[name] ?? initial[name] ?? "";
  const err = (name: EventField) => state?.fieldErrors?.[name];
  const fieldClass = (name: EventField) => `field${err(name) ? " invalid" : ""}`;
  const msg = (name: EventField) =>
    err(name) && <span className="field-msg">⚠ {err(name)}</span>;

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="variant" value={variant} />
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      {state?.error && <div className="notice error">{state.error}</div>}

      {variant !== "settings" && (
        <label className={fieldClass("title")}>
          イベント名
          <input
            type="text"
            name="title"
            required
            defaultValue={value("title")}
            placeholder="ファンミーティング Vol.6"
          />
          {msg("title")}
        </label>
      )}
      <label className={fieldClass("startsAt")}>
        開催日時
        <input
          type="datetime-local"
          name="startsAt"
          required
          defaultValue={value("startsAt")}
        />
        {msg("startsAt")}
      </label>
      <label className={fieldClass("venue")}>
        会場
        <input
          type="text"
          name="venue"
          required
          defaultValue={value("venue")}
          placeholder="渋谷カルチャーホール"
        />
        {msg("venue")}
      </label>
      <label className="field">
        概要(任意)
        <textarea
          name="description"
          rows={4}
          defaultValue={value("description")}
          placeholder="イベントの内容・持ち物・注意事項など。会員向けの申込ページと告知文に表示されます"
        />
      </label>
      <label className={fieldClass("capacity")}>
        定員(当選者数)
        <input
          type="number"
          name="capacity"
          required
          min={1}
          defaultValue={value("capacity") || (variant === "create" ? "10" : "")}
        />
        {msg("capacity")}
      </label>
      <label className={fieldClass("closesAt")}>
        申込締切日時
        <input
          type="datetime-local"
          name="closesAt"
          required
          defaultValue={value("closesAt")}
        />
        {msg("closesAt")}
      </label>
      <label className={fieldClass("endsAt")}>
        イベント終了日時(任意。過ぎると自動で完了になります)
        <input type="datetime-local" name="endsAt" defaultValue={value("endsAt")} />
        {msg("endsAt")}
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {variant === "create" ? (
          <>
            <button type="submit">イベントを作成する(公開)</button>
            <button type="submit" name="mode" value="draft" className="secondary">
              一時保存(作成中に保存)
            </button>
          </>
        ) : (
          <button type="submit">
            {variant === "draft" ? "下書きを保存する" : "変更を保存する"}
          </button>
        )}
      </div>
    </form>
  );
}
