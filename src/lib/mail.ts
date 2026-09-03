// 当選のお知らせ(アプリ内通知)の文面。テンプレートはここに集約し、レビュー可能にする。
// メールでは送らない(2026-09-03 顧客判断)が、宛名・本文の構成は通知でも同じ。
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import type { EventRow } from "@/lib/events";

export function buildWinMail(input: {
  event: Pick<EventRow, "title" | "starts_at" | "venue">;
  displayName: string;
  ticketId: string;
  kind: "selection_won" | "promotion_won";
}): { subject: string; body: string } {
  // 繰上当選でも受信者には通常の当選と同じ文面で案内する(繰上の区別は
  // 運営画面の通知履歴にのみ残す)。kind は履歴記録のため引き続き受け取る。
  const { event, displayName, ticketId } = input;
  const ticketUrl = `${appUrl()}/my/tickets/${ticketId}`;
  const subject = `【当選】${event.title} ご参加確定のお知らせ`;
  const lead = "抽選の結果、ご参加が確定しました。";
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
    "当日は、下記のチケットページの入場QRコードを受付でご提示ください。",
    ticketUrl,
    "",
    `申込状況の確認: ${appUrl()}/my`,
  ].join("\n");
  return { subject, body };
}
