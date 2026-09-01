// 通知チャネルのアダプタ。
// モックはメール(Resend)。別チャネルの要望があればここに実装を足す。
// RESEND_API_KEY 未設定時はコンソール出力にフォールバックする
// (通知履歴には記録されるので、キーなしでも画面デモは成立する)。
import { Resend } from "resend";

export interface NotifyChannel {
  /** 送信失敗時は throw する。呼び出し側が notifications に失敗を記録する */
  send(input: { to: string; subject: string; body: string }): Promise<void>;
}

class ResendChannel implements NotifyChannel {
  private client = new Resend(process.env.RESEND_API_KEY);

  async send({ to, subject, body }: { to: string; subject: string; body: string }) {
    const { error } = await this.client.emails.send({
      from: process.env.MAIL_FROM || "onboarding@resend.dev",
      to,
      subject,
      text: body,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
  }
}

class ConsoleChannel implements NotifyChannel {
  async send({ to, subject, body }: { to: string; subject: string; body: string }) {
    console.log(`[notify:console] to=${to} subject=${subject}\n${body}`);
  }
}

export function getNotifyChannel(): NotifyChannel {
  return process.env.RESEND_API_KEY ? new ResendChannel() : new ConsoleChannel();
}
