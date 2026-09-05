"use client";

// 送信待ちメールの自動送信ドライバ(管理画面用)。
// 送信待ちがある間 /api/notify/process を繰り返し呼び、無料枠の予算内なら
// 当日中に送り切る(2026-09-05 顧客要望: 予算オーバー時だけ翌日へ持ち越す)。
// ページを閉じても中断されるだけで、残りは開き直すと再開し、
// 最終的には日次の Cron が拾う。
import { useEffect, useRef, useState } from "react";

type Result = { sent: number; failed: number; remaining: number };

export function QueueSender({ initialPending }: { initialPending: number }) {
  const [sent, setSent] = useState(0);
  const [failed, setFailed] = useState(0);
  const [remaining, setRemaining] = useState(initialPending);
  const [state, setState] = useState<"running" | "done" | "budget" | "error">(
    "running"
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      let left = initialPending;
      while (!cancelled && left > 0) {
        try {
          const res = await fetch("/api/notify/process", { method: "POST" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const r = (await res.json()) as Result;
          if (cancelled) return;
          setSent((s) => s + r.sent);
          setFailed((f) => f + r.failed);
          setRemaining(r.remaining);
          left = r.remaining;
          if (left > 0 && r.sent === 0 && r.failed === 0) {
            // 1通も進まなかった = 本日の無料枠(全プロバイダ)を使い切った
            setState("budget");
            return;
          }
        } catch {
          if (!cancelled) setState("error");
          return;
        }
      }
      if (!cancelled) setState("done");
    })();
    return () => {
      cancelled = true;
    };
    // 初回マウント時のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "done" && sent === 0 && failed === 0) return null;

  return (
    <div className={`notice ${state === "error" ? "error" : state === "done" ? "success" : "info"}`}>
      {state === "running" && (
        <>
          結果連絡メールを自動送信しています… 送信済み {sent} 通 / 残り {remaining} 通。
          このページは開いたままで大丈夫です(閉じた場合も、開き直すと再開します)。
        </>
      )}
      {state === "done" && (
        <>
          送信待ちのメールをすべて処理しました(送信 {sent} 通
          {failed > 0 && <> / 中止・失敗 {failed} 通(詳細は通知履歴)</>})。
        </>
      )}
      {state === "budget" && (
        <>
          本日の無料枠を使い切ったため、ここまでで {sent} 通を送信しました。
          残り {remaining} 通は明日、自動で送信されます。
        </>
      )}
      {state === "error" && (
        <>
          送信処理でエラーが発生しました(送信済み {sent} 通 / 残り {remaining} 通)。
          ページを再読み込みすると再開します。
        </>
      )}
    </div>
  );
}
