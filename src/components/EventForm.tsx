"use client";

// イベントのフォーム(新規作成・下書き編集・設定変更)。
// - 入力ミスがあってもページ遷移せず、入力値をそのまま残して
//   満たしていない項目だけを薄赤で強調し、そこだけ直せるようにする
// - 入力のたびにブラウザ(localStorage)へ自動保存し、リフレッシュや
//   誤って閉じた場合も復元する。保存に成功したら消す
import { useActionState, useEffect, useRef, useState } from "react";
import { submitEventFormAction, type EventFormState } from "@/app/admin/actions";
import type { EventField } from "@/lib/events";

type Variant = "create" | "draft" | "settings";

const FIELDS = [
  "title",
  "startsAt",
  "venue",
  "description",
  "capacity",
  "closesAt",
  "endsAt",
] as const;

function fieldElement(
  form: HTMLFormElement | null,
  name: string
): HTMLInputElement | HTMLTextAreaElement | null {
  const el = form?.elements.namedItem(name);
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    ? el
    : null;
}

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
  const formRef = useRef<HTMLFormElement>(null);
  const [restored, setRestored] = useState(false);
  const storageKey = `eventForm:${variant}:${eventId ?? "new"}`;

  const readForm = (): Record<string, string> => {
    const data: Record<string, string> = {};
    for (const name of FIELDS) {
      const el = fieldElement(formRef.current, name);
      if (el) data[name] = el.value;
    }
    return data;
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(readForm()));
    } catch {}
  };
  const clearDraft = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  };

  // 初回表示時: 自動保存が残っていれば欄に書き戻す
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, string>;
      let changed = false;
      for (const name of FIELDS) {
        const el = fieldElement(formRef.current, name);
        if (el && saved[name] !== undefined && el.value !== saved[name]) {
          el.value = saved[name];
          changed = true;
        }
      }
      if (changed) setRestored(true);
      else if (variant === "create") clearDraft();
    } catch {}
    // storageKey はマウント後に変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, formAction] = useActionState<EventFormState, FormData>(
    async (prev, formData) => {
      // 成功時は redirect で戻ってこないため、先に消しておき、
      // 入力ミスで戻ってきたときだけ保存し直す
      clearDraft();
      const result = await submitEventFormAction(prev, formData);
      if (result) {
        try {
          const data: Record<string, string> = {};
          for (const name of FIELDS) data[name] = String(formData.get(name) ?? "");
          localStorage.setItem(storageKey, JSON.stringify(data));
        } catch {}
      }
      return result;
    },
    null
  );

  // エラーで戻ってきたときは送信した値を優先して欄に残す
  const value = (name: string) => state?.values?.[name] ?? initial[name] ?? "";
  const err = (name: EventField) => state?.fieldErrors?.[name];
  const fieldClass = (name: EventField) => `field${err(name) ? " invalid" : ""}`;
  const msg = (name: EventField) =>
    err(name) && <span className="field-msg">⚠ {err(name)}</span>;

  return (
    <form ref={formRef} action={formAction} className="stack" onInput={saveDraft}>
      <input type="hidden" name="variant" value={variant} />
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      {state?.error && <div className="notice error">{state.error}</div>}
      {restored && (
        <div className="notice info" style={{ marginBottom: 0 }}>
          入力途中の内容を復元しました(入力は自動保存されています)。{" "}
          <button
            type="button"
            className="secondary small"
            onClick={() => {
              clearDraft();
              formRef.current?.reset();
              setRestored(false);
            }}
          >
            復元を破棄して元に戻す
          </button>
        </div>
      )}

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
