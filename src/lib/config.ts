// 仮置きの設定値。ヒアリング後に差し替える。

// 繰上の締切: イベント開始2時間前 TODO(hearing:Q7)
export const PROMOTION_DEADLINE_HOURS = 2;

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
