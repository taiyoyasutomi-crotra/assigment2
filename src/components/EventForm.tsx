"use client";

// イベントのフォーム(新規作成・下書き編集・設定変更)。
// - 入力ミスがあってもページ遷移せず、入力値をそのまま残して
//   満たしていない項目だけを薄赤で強調し、そこだけ直せるようにする
// - 入力中も同じ検証をその場で行い、日時の矛盾(締切が開催より後など)は
//   送信を待たずに警告する。入力途中の空欄は指摘しない
// - 入力のたびにブラウザ(localStorage)へ自動保存し、リフレッシュや
//   誤って閉じた場合も復元する。保存に成功したら消す
import { useActionState, useEffect, useRef, useState } from "react";
import { submitEventFormAction, type EventFormState } from "@/app/admin/actions";
import {
  validateEventFields,
  type EventField,
  type EventFieldErrors,
} from "@/lib/eventValidation";
import { parseJstLocal } from "@/lib/format";

type Variant = "create" | "draft" | "settings";

const FIELDS = [
  "title",
  "startsAt",
  "venue",
  "publicVenue",
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

  // 入力中のリアルタイム検証。サーバーと同じ検証を使い、入力途中の欄(空欄)は
  // 指摘しない(空欄は送信時に required とサーバー側が拾う)。
  // null = まだ入力していない(サーバーから返った項目別エラーを表示する)
  const [liveErrors, setLiveErrors] = useState<EventFieldErrors | null>(null);
  const computeLiveErrors = () => {
    const v = readForm();
    const all = validateEventFields({
      title: variant === "settings" ? undefined : v.title,
      startsAt: parseJstLocal(v.startsAt || ""),
      venue: v.venue ?? "",
      capacity: Number(v.capacity || NaN),
      closesAt: parseJstLocal(v.closesAt || ""),
      endsAt: v.endsAt ? parseJstLocal(v.endsAt) : null,
    });
    const errors: EventFieldErrors = {};
    for (const [name, message] of Object.entries(all)) {
      if (v[name]) errors[name as EventField] = message;
    }
    setLiveErrors(errors);
  };

  // 初回表示時: 自動保存が残っていれば黙って欄に書き戻す
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
      if (changed) computeLiveErrors();
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

  // サーバーから項目別エラーが返ったら、次の入力まではそれを表示する
  // (初回マウント時は復元直後の検証結果を消さないようスキップ)
  const prevState = useRef(state);
  useEffect(() => {
    if (prevState.current !== state) {
      prevState.current = state;
      setLiveErrors(null);
    }
  }, [state]);

  // エラーで戻ってきたときは送信した値を優先して欄に残す
  const value = (name: string) => state?.values?.[name] ?? initial[name] ?? "";
  const err = (name: EventField) =>
    liveErrors ? liveErrors[name] : state?.fieldErrors?.[name];
  const fieldClass = (name: EventField) => `field${err(name) ? " invalid" : ""}`;
  const msg = (name: EventField) =>
    err(name) && <span className="field-msg">⚠ {err(name)}</span>;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="stack"
      onInput={() => {
        saveDraft();
        computeLiveErrors();
      }}
    >
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
        公開用の場所表記(任意。会場を当選者にだけ知らせたい場合)
        <input
          type="text"
          name="publicVenue"
          defaultValue={value("publicVenue")}
          placeholder="都内某所(参加確定の方にだけ詳細をお知らせします)"
        />
        <span className="muted" style={{ fontWeight: 400, fontSize: "0.82rem" }}>
          入力すると、告知文・申込ページにはこの表記が出て、実際の会場は
          当選者への連絡にだけ表示されます。空欄なら会場をそのまま公開します。
        </span>
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
