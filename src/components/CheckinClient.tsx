"use client";

// 受付画面(F6)。スマホのカメラで QR を読み取り、サーバーで照合する。
// 合格は緑・不合格は赤の全画面で表示し、読み取りから1秒以内に合否を出す。
import { useEffect, useRef, useState } from "react";
import { formatJst } from "@/lib/format";

type CheckinResponse =
  | { ok: true; displayName: string }
  | {
      ok: false;
      reason: "invalid" | "wrong_event" | "cancelled" | "already";
      message: string;
      displayName?: string;
      checkedInAt?: string;
    };

type WinnerRow = {
  application_id: string;
  display_name: string;
  token: string | null;
  checked_in_at: string | null;
  revoked_at: string | null;
};

export function CheckinClient({ eventId }: { eventId: string }) {
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<WinnerRow[] | null>(null);
  const scannerRef = useRef<{ pause: (b?: boolean) => void; resume: () => void; stop: () => Promise<void> } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let scanner: { stop: () => Promise<void> } | null = null;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const instance = new Html5Qrcode("qr-reader");
      scanner = instance;
      scannerRef.current = instance;
      try {
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded: string) => void submitToken(decoded),
          () => {}
        );
      } catch {
        setCameraError(
          "カメラを起動できませんでした。カメラの使用を許可するか、下の手動検索を利用してください。"
        );
      }
    })();
    return () => {
      cancelled = true;
      scanner?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitToken(token: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      scannerRef.current?.pause(true);
    } catch {}
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, token }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult((await res.json()) as CheckinResponse);
    } catch {
      setResult({
        ok: false,
        reason: "invalid",
        message: "照合に失敗しました。通信環境を確認してください",
      });
    }
  }

  function nextScan() {
    setResult(null);
    setRows(null);
    busyRef.current = false;
    try {
      scannerRef.current?.resume();
    } catch {}
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(
      `/api/checkin/search?eventId=${encodeURIComponent(eventId)}&q=${encodeURIComponent(query)}`
    );
    if (res.ok) {
      const json = await res.json();
      setRows(json.rows as WinnerRow[]);
    }
  }

  return (
    <div className="checkin-root">
      {cameraError ? (
        <div className="notice error">{cameraError}</div>
      ) : (
        <div id="qr-reader" />
      )}

      <h2>QRが読めないとき(表示名で検索)</h2>
      <form onSubmit={search} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="表示名の一部"
          style={{ flex: 1 }}
        />
        <button type="submit" className="secondary">
          検索
        </button>
      </form>
      {rows && (
        <table className="data" style={{ marginTop: 12 }}>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="muted">該当する当選者がいません</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.application_id}>
                <td>{r.display_name}</td>
                <td>
                  {r.checked_in_at ? (
                    <span className="muted">入場済み</span>
                  ) : r.token && !r.revoked_at ? (
                    <button
                      type="button"
                      className="small"
                      onClick={() => {
                        busyRef.current = false;
                        void submitToken(r.token!);
                      }}
                    >
                      手動チェックイン
                    </button>
                  ) : (
                    <span className="muted">チケット無効</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {result && (
        <div className={`checkin-result ${result.ok ? "ok" : "ng"}`}>
          {result.ok ? (
            <>
              <div className="big">✓ 入場OK</div>
              <div className="name">{result.displayName} 様</div>
            </>
          ) : (
            <>
              <div className="big">✕ 入場できません</div>
              {result.displayName && <div className="name">{result.displayName} 様</div>}
              <div className="detail">{result.message}</div>
              {result.reason === "already" && result.checkedInAt && (
                <div className="detail">初回入場: {formatJst(result.checkedInAt)}</div>
              )}
            </>
          )}
          <button type="button" onClick={nextScan}>
            次をスキャン
          </button>
        </div>
      )}
    </div>
  );
}
