// 日時表示はすべて日本時間で統一する
const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatJst(d: Date | string): string {
  return fmt.format(typeof d === "string" ? new Date(d) : d);
}

// <input type="datetime-local"> の値(例 "2026-09-10T18:00")を JST として解釈する
export function parseJstLocal(value: string): Date {
  const v = value.length === 16 ? `${value}:00` : value; // 秒なし形式に対応
  return new Date(`${v}+09:00`);
}
