"use client";

// 当選者のキャンセル操作(F5)。
// 1クリック → 確認ダイアログ(誰をキャンセルし、誰が繰り上がるかを表示)→ 承認で実行。
// 「本当に消しますか?」ではなく「この人が繰り上がりますが、よいですか?」と聞く。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewCancelAction,
  executeCancelAction,
} from "@/app/admin/actions";
import type { CancelPreview } from "@/lib/cancel";

export function CancelButton({
  applicationId,
  eventId,
}: {
  applicationId: string;
  eventId: string;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () => {
    setError(null);
    startTransition(async () => {
      const p = await previewCancelAction(applicationId);
      if (!p.ok) {
        setError(p.error);
        return;
      }
      setPreview(p);
    });
  };

  const execute = () => {
    startTransition(async () => {
      const result = await executeCancelAction(applicationId, eventId);
      setPreview(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // 再読み込みなしで一覧と通知履歴を更新する
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        className="danger small"
        onClick={open}
        disabled={pending}
      >
        キャンセル
      </button>
      {error && <span style={{ color: "var(--danger)", marginLeft: 8 }}>{error}</span>}
      {preview?.ok && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>キャンセルの確認</h3>
            <p>
              <strong>{preview.cancelName}</strong> さんの当選をキャンセルし、
              チケットを無効化します。
            </p>
            {preview.promote ? (
              <p>
                繰上: 待機1位の <strong>{preview.promote.name}</strong>{" "}
                さんが繰り上げ当選となり、当選メールが自動送信されます。よろしいですか?
              </p>
            ) : (
              <p className="muted">繰上なし: {preview.noPromoteReason}</p>
            )}
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setPreview(null)}
                disabled={pending}
              >
                やめる
              </button>
              <button
                type="button"
                className="danger"
                onClick={execute}
                disabled={pending}
              >
                {pending ? "実行中..." : "承認して実行"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
