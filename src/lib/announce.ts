// 告知文の自動生成(F2)。運営者がコピーしてチャットに手動投稿する(半自動化)。
// 「結果は申込状況ページで確認」の案内は必須(これがないと問い合わせが運営者に集中する)。
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import { isLottery, type EventRow } from "@/lib/events";

export function buildAnnouncement(event: EventRow): string {
  const url = `${appUrl()}/events/${event.id}`;
  const lines = [
    `【参加者募集】${event.title}`,
    "",
    `日時: ${formatJst(event.starts_at)}`,
    `会場: ${event.venue}`,
    `定員: ${event.capacity}名`,
    isLottery(event)
      ? `※応募多数の場合は抽選です(申込受付は${event.application_limit}名まで)`
      : "※先着順です。定員に達し次第締め切ります",
    "",
    `お申し込みはこちら: ${url}`,
    `申込締切: ${formatJst(event.closes_at)}`,
    "",
    "抽選・繰上の結果は、当選された方にメールでお知らせします。",
    `結果はマイページの申込状況(${appUrl()}/my)からも確認できます。`,
  ];
  return lines.join("\n");
}
