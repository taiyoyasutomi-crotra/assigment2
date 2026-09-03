"use client";

// お知らせ1件の開閉つきカード。
// 件名をタップして本文を開いたときに、その1件だけを既読にする
// (ページを開いただけでは既読にしない)。既読化後は router.refresh() で
// ヘッダーの未読バッジを更新する(開閉状態はクライアント側で保持されるため閉じない)。
import { useState } from "react";
import { useRouter } from "next/navigation";

export function NotificationItem({
  id,
  subject,
  dateLabel,
  initiallyRead,
  markAction,
  children,
}: {
  id: string;
  subject: string;
  dateLabel: string;
  initiallyRead: boolean;
  markAction: (id: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(initiallyRead);
  const router = useRouter();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !read) {
      setRead(true);
      markAction(id).then(() => router.refresh());
    }
  };

  return (
    <div className={`notif ${read ? "read" : ""} ${open ? "open" : ""}`}>
      <button type="button" className="notif-summary" onClick={toggle}>
        <span className="notif-subject">
          {subject}
          {!read && (
            <>
              {" "}
              <span className="badge won">新着</span>
            </>
          )}
        </span>
        <span className="notif-date">
          {dateLabel} {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <div className="notif-body">{children}</div>}
    </div>
  );
}
