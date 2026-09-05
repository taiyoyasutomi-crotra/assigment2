// 通知チャネルのアダプタ。
// 無料枠で1日200通以上を送るため(2026-09-05 顧客要望)、複数プロバイダを併用する:
// - Resend: 無料枠 100通/日(予算は既定90通。認証メール分を残す)
// - Brevo:  無料枠 300通/日(予算は既定290通)。BREVO_API_KEY 設定時に有効
// 合計で最大380通/日。送信キュー(notifications.ts)が予算の残っている
// プロバイダを選んで送る。どちらのキーも未設定ならコンソール出力に
// フォールバックする(通知履歴には記録されるので、キーなしでも画面デモは成立する)。
import { Resend } from "resend";

export type NotifyAttachment = {
  filename: string;
  content: Buffer;
};

export type NotifyInput = {
  to: string;
  subject: string;
  body: string;
  attachments?: NotifyAttachment[];
};

export interface NotifyChannel {
  /** 送信失敗時は throw する。呼び出し側が notifications に失敗を記録する */
  send(input: NotifyInput): Promise<void>;
}

export type NotifyProvider = {
  /** notifications.provider に記録する識別子 */
  name: string;
  /** 1日の送信予算(無料枠から認証メール等の余裕を引いた値) */
  dailyLimit: number;
  channel: NotifyChannel;
};

class ResendChannel implements NotifyChannel {
  private client = new Resend(process.env.RESEND_API_KEY);

  async send({ to, subject, body, attachments }: NotifyInput) {
    const { error } = await this.client.emails.send({
      from: process.env.MAIL_FROM || "onboarding@resend.dev",
      to,
      subject,
      text: body,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    if (error) throw new Error(`Resend: ${error.message}`);
  }
}

// Brevo(旧Sendinblue)。SDK は使わず REST API を直接叩く(依存を増やさない)
class BrevoChannel implements NotifyChannel {
  async send({ to, subject, body, attachments }: NotifyInput) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: process.env.MAIL_FROM || "onboarding@resend.dev" },
        to: [{ email: to }],
        subject,
        textContent: body,
        attachment: attachments?.map((a) => ({
          name: a.filename,
          content: a.content.toString("base64"),
        })),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Brevo: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
  }
}

class ConsoleChannel implements NotifyChannel {
  async send({ to, subject, body, attachments }: NotifyInput) {
    const files = attachments?.map((a) => a.filename).join(", ") || "なし";
    console.log(`[notify:console] to=${to} subject=${subject} attachments=${files}\n${body}`);
  }
}

function limitFromEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** 利用可能な送信プロバイダ(予算の消費順)。キー未設定ならコンソールのみ */
export function getNotifyProviders(): NotifyProvider[] {
  const providers: NotifyProvider[] = [];
  if (process.env.RESEND_API_KEY) {
    providers.push({
      name: "resend",
      dailyLimit: limitFromEnv("NOTIFY_DAILY_LIMIT", 90),
      channel: new ResendChannel(),
    });
  }
  if (process.env.BREVO_API_KEY) {
    providers.push({
      name: "brevo",
      dailyLimit: limitFromEnv("NOTIFY_BREVO_DAILY_LIMIT", 290),
      channel: new BrevoChannel(),
    });
  }
  if (providers.length === 0) {
    providers.push({
      name: "console",
      dailyLimit: Number.MAX_SAFE_INTEGER,
      channel: new ConsoleChannel(),
    });
  }
  return providers;
}

/** 認証メール等、キュー外の単発送信用(先頭プロバイダを使う) */
export function getNotifyChannel(): NotifyChannel {
  return getNotifyProviders()[0].channel;
}
