// 当選のお知らせ(アプリ内通知)の文面。テンプレートはここに集約し、レビュー可能にする。
// メールでは送らない(2026-09-03 顧客判断)が、宛名・本文の構成は通知でも同じ。
// 文面は顧客の当選連絡テンプレ(2026-09-04 受領)をベースに、本システムの運用に合わせて調整:
// - 「このメールへ返信」でのキャンセルは廃止 → マイページの申込状況からキャンセル
// - 受付は本名の口頭確認ではなく、チケットページの入場QRコードを提示
// 運営者はイベントごとに文面を編集できる(events.win_message)。{お名前} 等の
// 差し込みタグは通知の作成時(選定・繰上)に実際の値へ置き換える。
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import type { EventRow } from "@/lib/events";

/** 当選連絡の文面で使える差し込みタグ(管理画面の説明表示にも使う) */
export const WIN_MESSAGE_TAGS = [
  "{お名前}",
  "{イベント名}",
  "{日時}",
  "{会場}",
  "{チケットURL}",
  "{マイページURL}",
] as const;

/** 当選連絡のデフォルト文面(差し込みタグ入り)。運営者が編集する際の叩き台 */
export function defaultWinMessage(): string {
  return [
    "{お名前}さん、こんにちは!サロン運営です🌙",
    "「{イベント名}」へのお申込みありがとうございました!",
    "",
    "ご参加確定です🎉✨当日お会いできるのを楽しみにしています!",
    "",
    "【日時】{日時}",
    "【会場】{会場}",
    "",
    "当日は受付で、下記チケットページの入場QRコードをご提示ください📋",
    "{チケットURL}",
    "",
    "⚠️キャンセルされる場合は、マイページの申込状況から必ずお手続きください。",
    "キャンセル待ちの方がいらっしゃいます🙏",
    "申込状況の確認: {マイページURL}",
  ].join("\n");
}

// 値に $ が含まれても安全なように replaceAll ではなく split/join で置換する
function fillTags(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [tag, value] of Object.entries(values)) {
    out = out.split(tag).join(value);
  }
  return out;
}

export function buildWinMail(input: {
  event: Pick<EventRow, "title" | "starts_at" | "venue" | "win_message">;
  displayName: string;
  ticketId: string;
  kind: "selection_won" | "promotion_won";
}): { subject: string; body: string } {
  // 繰上当選でも受信者には通常の当選と同じ文面で案内する(繰上の区別は
  // 運営画面の通知履歴にのみ残す)。kind は履歴記録のため引き続き受け取る。
  const { event, displayName, ticketId } = input;
  const subject = `【参加確定🌙】${event.title}`;
  const template = event.win_message ?? defaultWinMessage();
  const body = fillTags(template, {
    "{お名前}": displayName,
    "{イベント名}": event.title,
    "{日時}": formatJst(event.starts_at),
    "{会場}": event.venue,
    "{チケットURL}": `${appUrl()}/my/tickets/${ticketId}`,
    "{マイページURL}": `${appUrl()}/my`,
  });
  return { subject, body };
}
