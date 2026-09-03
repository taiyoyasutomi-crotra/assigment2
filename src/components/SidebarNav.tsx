"use client";

// 管理系ページの左タブ列。
// PC: 常時表示のサイドバー。
// スマホ: タブ列は普段は格納し、左上のハンバーガー(☰)をタップすると
//         左から縦のタブ列がドロワーでスライドインする。
//         タブを選ぶとページ遷移で再描画されるため、自動的に格納状態へ戻る。
import { useState } from "react";

export function SidebarNav({
  current,
  children,
}: {
  /** ハンバーガーの横に表示する、選択中タブの名前 */
  current: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* スマホ用: 小さな☰ボタン+選択中タブ名(タイトル表示。ボタンは☰のみ) */}
      <div className="nav-mobile-bar">
        <button
          type="button"
          className="nav-hamburger"
          onClick={() => setOpen(true)}
          aria-label="タブメニューを開く"
          aria-expanded={open}
        >
          ☰
        </button>
        <span className="nav-current">{current}</span>
      </div>
      <div
        className={`nav-drawer-backdrop ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`settings-nav ${open ? "open" : ""}`}
        // タブ(リンク)を選んだらドロワーを格納する。
        // Next.js のクライアント遷移では状態が維持されるため、明示的に閉じる
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        {children}
      </aside>
    </>
  );
}
