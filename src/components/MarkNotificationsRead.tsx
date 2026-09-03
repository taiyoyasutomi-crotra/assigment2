"use client";

// お知らせページを開いたら既読化のサーバーアクションを1回だけ呼び、
// 完了後に router.refresh() でヘッダー(レイアウト)の未読バッジを消す。
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function MarkNotificationsRead({
  action,
}: {
  action: () => Promise<void>;
}) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    action().then(() => router.refresh());
  }, [action, router]);

  return null;
}
