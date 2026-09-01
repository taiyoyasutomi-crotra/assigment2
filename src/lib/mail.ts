// 当選メールの文面。テンプレートはここに集約し、レビュー可能にする。
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import type { EventRow } from "@/lib/events";

export function buildWinMail(input: {
  event: Pick<EventRow, "title" | "starts_at" | "venue">;
  displayName: string;
  ticketId: string;
  kind: "selection_won" | "promotion_won";
}): { subject: string; body: string } {
  const { event, displayName, ticketId, kind } = input;
  const ticketUrl = `${appUrl()}/my/tickets/${ticketId}`;
  const subject =
    kind === "promotion_won"
      ? `【繰上当選】${event.title} ご参加確定のお知らせ`
      : `【当選】${event.title} ご参加確定のお知らせ`;
  const lead =
    kind === "promotion_won"
      ? "キャンセルが発生したため、繰り上げでご参加が確定しました。"
      : "抽選の結果、ご参加が確定しました。";
  const body = [
    `${displayName} 様`,
    "",
    `「${event.title}」にお申し込みいただきありがとうございます。`,
    lead,
    "",
    `イベント: ${event.title}`,
    `日時: ${formatJst(event.starts_at)}`,
    `会場: ${event.venue}`,
    "",
    "当日は下記の入場チケット(QRコード)を受付でご提示ください。",
    ticketUrl,
    "",
    `申込状況の確認: ${appUrl()}/my`,
  ].join("\n");
  return { subject, body };
}
