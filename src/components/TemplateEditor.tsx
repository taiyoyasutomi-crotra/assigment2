"use client";

// 告知文・当選連絡の文面エディタ。
// 編集して「保存」するとイベントに文面が保存され、以後はそれが使われる。
// 「自動生成の文面に戻す」は欄を戻すだけで、保存して初めて反映される。
import { useState } from "react";
import { saveTemplateAction } from "@/app/admin/actions";

export function TemplateEditor({
  eventId,
  field,
  savedText,
  defaultText,
  copyLabel,
  rows = 16,
}: {
  eventId: string;
  field: "announce" | "win";
  /** 保存済みの文面(null なら自動生成を表示) */
  savedText: string | null;
  /** 自動生成の文面(「戻す」で使う) */
  defaultText: string;
  /** 指定するとコピー用ボタンを表示する */
  copyLabel?: string;
  rows?: number;
}) {
  const [text, setText] = useState(savedText ?? defaultText);
  const [copied, setCopied] = useState(false);
  return (
    <form action={saveTemplateAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="field" value={field} />
      <textarea
        className="announce-box"
        name="text"
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit">文面を保存する</button>
        {copyLabel && (
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "コピーしました ✓" : copyLabel}
          </button>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => setText(defaultText)}
        >
          自動生成の文面に戻す
        </button>
      </div>
    </form>
  );
}
