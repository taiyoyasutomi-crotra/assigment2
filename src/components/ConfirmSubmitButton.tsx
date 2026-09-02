"use client";

// 確認ダイアログを1回挟んでからフォームを送信するボタン(手動締切などに使用)。
// window.confirm はスマホのアプリ内ブラウザ等でブロックされることがあるため、
// 自前のモーダルで実装する。
import { useRef, useState } from "react";

export function ConfirmSubmitButton({
  message,
  children,
  className,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(e) => {
          formRef.current = e.currentTarget.form;
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => !pending && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>確認</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{message}</p>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                やめる
              </button>
              <button
                type="button"
                className="danger"
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  formRef.current?.requestSubmit();
                }}
              >
                {pending ? "実行中..." : "実行する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
