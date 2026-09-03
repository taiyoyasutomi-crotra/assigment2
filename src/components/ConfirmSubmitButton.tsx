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
          const form = e.currentTarget.form;
          // 入力不備(必須・文字数など)はダイアログを開く前にブラウザの検証で知らせる。
          // 検証NGのまま進むと送信されず「実行中...」で固まるため
          if (form && !form.checkValidity()) {
            form.reportValidity();
            return;
          }
          formRef.current = form;
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
                  const form = formRef.current;
                  // 念のため送信直前にも検証。NGなら固まらずにダイアログを閉じて知らせる
                  if (form && !form.checkValidity()) {
                    setOpen(false);
                    setPending(false);
                    form.reportValidity();
                    return;
                  }
                  setPending(true);
                  form?.requestSubmit();
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
