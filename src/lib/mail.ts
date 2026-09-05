// 当選連絡メールの文面。テンプレートはここに集約し、レビュー可能にする。
// 当選連絡はメールで送る(QRチケット添付。2026-09-05 顧客判断:
// 会員がこのシステムを見に来なくても結果に気づけるようにする)。
// 文面は顧客の当選連絡テンプレ(2026-09-04 受領)がベース。
// 運営者はイベントごとに文面を編集できる(events.win_message)。
// イベント名・日時・会場など編集時点で確定している値は実際の値を埋め込み、
// 当選者ごとに変わる {お名前} と {確認URL} だけタグとして残す
// (タグは送信時に置き換える。{イベント名} 等のタグも書けば使える)。
import { appUrl } from "@/lib/config";
import { formatJst } from "@/lib/format";
import type { EventRow } from "@/lib/events";

/** 当選連絡のデフォルト文面。運営者が編集する際の叩き台 */
export function defaultWinMessage(
  event: Pick<EventRow, "title" | "starts_at" | "venue" | "cancel_deadline">
): string {
  return [
    "{お名前}さん、こんにちは!サロン運営です🌙",
    `「${event.title}」へのお申込みありがとうございました!`,
    "",
    "ご参加確定です🎉✨当日お会いできるのを楽しみにしています!",
    "",
    `【日時】${formatJst(event.starts_at)}`,
    `【会場】${event.venue}`,
    "",
    "当日は受付で、このメールに添付の入場QRコードをご提示ください📋",
    "(QRコードは下記の申込状況ページでも表示できます)",
    "",
    // キャンセル受付期限を設定している場合は文面に自動で入れる
    ...(event.cancel_deadline
      ? [
          `⚠️キャンセルされる場合は【${formatJst(event.cancel_deadline)}まで】に、`,
          "下記ページの「参加をキャンセルする」から必ずお手続きください。",
        ]
      : [
          "⚠️キャンセルされる場合は、下記ページの「参加をキャンセルする」から",
          "必ずお手続きください。",
        ]),
    "繰上待ちの方へ自動でご連絡が届きます🙏",
    "",
    "【申込状況の確認・キャンセルはこちら】",
    "{確認URL}",
    "",
    "※このご連絡に心当たりがない場合はお手数ですが破棄してください。",
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

/** 待機(繰上待ち)連絡。全員に結果を届ける方針のため、待機者にもメールする */
export function buildWaitlistMail(input: {
  event: Pick<EventRow, "title">;
  applicantName: string;
  waitlistOrder: number;
  applicationToken: string;
}): { subject: string; body: string } {
  const { event, applicantName, waitlistOrder, applicationToken } = input;
  return {
    subject: `【繰上待ちのご案内】${event.title}`,
    body: [
      `${applicantName}さん、こんにちは!サロン運営です🌙`,
      `「${event.title}」へのお申込みありがとうございました!`,
      "",
      `先着順の結果、定員に達したため、現在は繰上待ち(待機${waitlistOrder}位)でのご案内です。`,
      "キャンセルが出た場合は申込順に自動で繰り上がり、当選のご連絡メール",
      "(入場QRコード付き)をお送りします。",
      "",
      "【申込状況の確認・キャンセルはこちら】",
      `${appUrl()}/a/${applicationToken}`,
      "",
      "参加できなくなった場合は、上記ページからキャンセルをお願いします🙏",
    ].join("\n"),
  };
}

/**
 * 落選連絡。現在の運用で落選になるのは、申込メールアドレスが会員名簿と
 * 照合できなかった場合のみ(先着順のあふれは待機になる)。
 * 打ち間違いの救済につながるよう、その旨を本人に伝える
 */
export function buildLostMail(input: {
  event: Pick<EventRow, "title">;
  applicantName: string;
  applicationToken: string;
}): { subject: string; body: string } {
  const { event, applicantName, applicationToken } = input;
  return {
    subject: `【選考結果のご連絡】${event.title}`,
    body: [
      `${applicantName}さん、こんにちは!サロン運営です🌙`,
      `「${event.title}」へお申込みいただきありがとうございました。`,
      "",
      "誠に残念ながら、今回はご参加いただけませんでした。",
      "お申込みのメールアドレスがサロン会員として確認できなかったため、",
      "選考の対象外とさせていただいています。",
      "サロンに登録しているメールアドレスと違うアドレスで申し込んだ心当たりが",
      "ある場合(打ち間違いなど)は、お手数ですがサロン運営までご連絡ください。",
      "",
      "【申込状況の確認はこちら】",
      `${appUrl()}/a/${applicationToken}`,
      "",
      "次のイベントでお会いできることを楽しみにしています🌙",
    ].join("\n"),
  };
}

/** キャンセル受付の連絡。申込者がキャンセルした直後に送る */
export function buildCancelAckMail(input: {
  event: Pick<EventRow, "title">;
  applicantName: string;
}): { subject: string; body: string } {
  const { event, applicantName } = input;
  return {
    subject: `【キャンセル受付】${event.title}`,
    body: [
      `${applicantName}さん、こんにちは!サロン運営です🌙`,
      `「${event.title}」の参加キャンセルを受け付けました。`,
      "",
      "繰上待ちの方がいらっしゃる場合は、自動で繰上のご連絡をお送りします。",
      "またのお申込みをお待ちしています🌙",
    ].join("\n"),
  };
}

export function buildWinMail(input: {
  event: Pick<
    EventRow,
    "title" | "starts_at" | "venue" | "cancel_deadline" | "win_message"
  >;
  applicantName: string;
  /** 申込の確認トークン(申込状況ページのURLに使う) */
  applicationToken: string;
}): { subject: string; body: string } {
  // 繰上当選でも受信者には通常の当選と同じ文面で案内する(繰上の区別は
  // 運営画面の通知履歴にのみ残す)。
  const { event, applicantName, applicationToken } = input;
  const subject = `【参加確定🌙】${event.title}`;
  const template = event.win_message ?? defaultWinMessage(event);
  const body = fillTags(template, {
    "{お名前}": applicantName,
    "{確認URL}": `${appUrl()}/a/${applicationToken}`,
    "{イベント名}": event.title,
    "{日時}": formatJst(event.starts_at),
    "{会場}": event.venue,
    "{キャンセル期限}": event.cancel_deadline
      ? formatJst(event.cancel_deadline)
      : "開催直前",
  });
  return { subject, body };
}
