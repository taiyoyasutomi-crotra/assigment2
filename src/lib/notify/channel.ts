// 通知チャネルのアダプタ。
// モックはメール(Resend)。別チャネルの要望があればここに実装を足す。
// RESEND_API_KEY 未設定時はコンソール出力にフォールバックする
// (通知履歴には記録されるので、キーなしでも画面デモは成立する)。
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

class ConsoleChannel implements NotifyChannel {
  async send({ to, subject, body, attachments }: NotifyInput) {
    const files = attachments?.map((a) => a.filename).join(", ") || "なし";
    console.log(`[notify:console] to=${to} subject=${subject} attachments=${files}\n${body}`);
  }
}

export function getNotifyChannel(): NotifyChannel {
  return process.env.RESEND_API_KEY ? new ResendChannel() : new ConsoleChannel();
}
