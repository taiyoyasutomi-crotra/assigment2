"use client";

// 管理系ページの左タブ列。スマホでは画面占有を抑えるため、
// 「現在のタブ名のバー」に畳んでおき、タップで開閉する。
// タブを選ぶとページ遷移で再描画されるので、選択後は自動的に畳まれた状態に戻る。
// PCでは常に開いたサイドバーとして表示される(トグルは出ない)。
import { useState } from "react";

export function SidebarNav({
  current,
  children,
}: {
  /** 畳んだ状態のバーに表示する、選択中タブの名前 */
  current: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`settings-nav ${open ? "open" : ""}`}>
      <button
        type="button"
        className="nav-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{current}</span>
        <span aria-hidden="true">{open ? "▲ 閉じる" : "▼ タブを開く"}</span>
      </button>
      <div className="nav-items">{children}</div>
    </aside>
  );
}
