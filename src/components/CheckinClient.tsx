"use client";

// 受付画面(F6)。スマホのカメラで QR を読み取り、サーバーで照合する。
// 合格は緑・不合格は赤の全画面で表示し、読み取りから1秒以内に合否を出す。
// 下部は当日の参加者一覧ボード: 入場状況の確認と手動での入場/取消ができる。
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [winners, setWinners] = useState<WinnerRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [boardError, setBoardError] = useState<string | null>(null);
  const scannerRef = useRef<{ pause: (b?: boolean) => void; resume: () => void; stop: () => Promise<void> } | null>(null);
  const busyRef = useRef(false);

  const loadWinners = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/checkin/list?eventId=${encodeURIComponent(eventId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setWinners(json.rows as WinnerRow[]);
      setBoardError(null);
    } catch {
      setBoardError("一覧を取得できませんでした。通信環境を確認してください");
    }
  }, [eventId]);

  // 一覧は開いた時に読み込み、30秒ごとに自動更新(複数端末での受付に対応)
  useEffect(() => {
    void loadWinners();
    const timer = setInterval(() => void loadWinners(), 30_000);
    return () => clearInterval(timer);
  }, [loadWinners]);

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
          "カメラを起動できませんでした。カメラの使用を許可するか、下の一覧から手動で入場処理してください。"
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
    void loadWinners();
  }

  function nextScan() {
    setResult(null);
    busyRef.current = false;
    try {
      scannerRef.current?.resume();
    } catch {}
  }

  async function manual(applicationId: string, checkedIn: boolean) {
    try {
      const res = await fetch("/api/checkin/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, applicationId, checkedIn }),
      });
      const json = await res.json();
      if (!json.ok) setBoardError(json.error ?? "更新に失敗しました");
    } catch {
      setBoardError("更新に失敗しました。通信環境を確認してください");
    }
    void loadWinners();
  }

  const valid = (winners ?? []).filter((w) => w.token && !w.revoked_at);
  const checkedCount = valid.filter((w) => w.checked_in_at).length;
  const shown = (winners ?? []).filter(
    (w) => !filter || w.display_name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="checkin-root">
      {cameraError ? (
        <div className="notice error">{cameraError}</div>
      ) : (
        <div id="qr-reader" />
      )}

      <h2>参加者一覧</h2>
      {winners && (
        <div className="stat-row">
          <div className="stat">
            <div className="label">入場済み / 当選者</div>
            <div className="value">
              {checkedCount} / {valid.length}
            </div>
          </div>
        </div>
      )}
      {boardError && <div className="notice error">{boardError}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="表示名で絞り込み"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="secondary" onClick={() => void loadWinners()}>
          更新
        </button>
      </div>
      {winners === null ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td className="muted">該当する当選者がいません</td>
                </tr>
              )}
              {shown.map((r) => (
                <tr key={r.application_id}>
                  <td>{r.display_name}</td>
                  <td>
                    {!r.token || r.revoked_at ? (
                      <span className="muted">チケット無効</span>
                    ) : r.checked_in_at ? (
                      <span className="badge won">
                        入場済み {formatJst(r.checked_in_at)}
                      </span>
                    ) : (
                      <span className="badge neutral">未入場</span>
                    )}
                  </td>
                  <td>
                    {r.token && !r.revoked_at ? (
                      r.checked_in_at ? (
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() => void manual(r.application_id, false)}
                        >
                          取消
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="small"
                          onClick={() => void manual(r.application_id, true)}
                        >
                          入場
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
