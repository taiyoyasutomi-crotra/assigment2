"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "告知文をコピー",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "コピーしました ✓" : label}
    </button>
  );
}
