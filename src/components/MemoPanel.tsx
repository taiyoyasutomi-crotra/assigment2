"use client";

// 全画面共通のメモパネル(画面右側)。打ち合わせの画面共有中などに
// その場で書き留めるための自分用メモ。
// - このブラウザの localStorage に保存(サーバーには送らない)
// - 同じブラウザの別タブとは storage イベントで即時に同期される
//   (Aタブで書くとBタブにも反映される)。ページ移動・リロードでも残る
import { useEffect, useRef, useState } from "react";

const TEXT_KEY = "appMemo";
const OPEN_KEY = "appMemoOpen";

export function MemoPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    try {
      setText(localStorage.getItem(TEXT_KEY) ?? "");
      setOpen(localStorage.getItem(OPEN_KEY) === "1");
    } catch {}
    loaded.current = true;

    // 別タブでの変更を反映する(storage イベントは他タブの書き込みでのみ発火)
    const onStorage = (e: StorageEvent) => {
      if (e.key === TEXT_KEY) setText(e.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (value: string) => {
    setText(value);
    try {
      localStorage.setItem(TEXT_KEY, value);
    } catch {}
  };
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {}
  };

  return (
    <>
      <button
        type="button"
        className={`memo-toggle${open ? " open" : ""}`}
        onClick={() => toggle(!open)}
        aria-expanded={open}
      >
        {open ? "閉じる ▸" : "◂ メモ"}
      </button>
      {open && (
        <aside className="memo-panel">
          <div className="memo-panel-head">
            <strong>メモ</strong>
            <button
              type="button"
              className="secondary small"
              onClick={() => {
                if (text && !confirm("メモをすべて消します。よろしいですか?")) return;
                update("");
              }}
            >
              クリア
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => update(e.target.value)}
            placeholder="ここに書いたメモはこのブラウザに保存され、別のタブや他の画面を開いても残ります(他の人には見えません)"
          />
        </aside>
      )}
    </>
  );
}
