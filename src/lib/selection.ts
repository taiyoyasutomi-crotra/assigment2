// 参加者選定(F4)。先着順(2026-09-05 顧客要望):
// - 申込は締切まで受け付け、運営者が「選定を実行」した時点でまとめて確定する
// - 応募が定員以内: 全員当選
// - 応募が定員超過: 申込日時の早い順に capacity 人が当選、残りは申込順の待機
// 結果は全員にメールで連絡する(当選=QRチケット付き / 待機 / 落選)。
// メールは 'pending' として記録し、コミット後に送信キューが無料枠の範囲で送る。
// 選定は 1 イベント 1 回のみ。イベント行ロック + status 遷移で二重実行を防ぐ。
import { withTransaction } from "@/lib/db";
import { buildWinMail, buildWaitlistMail, buildLostMail } from "@/lib/mail";
import { issueTicket } from "@/lib/tickets";
import {
  recordNotification,
  processNotificationQueue,
} from "@/lib/notify/notifications";

export type SelectionResult =
  | { ok: true; winners: number; waitlisted: number; excluded: number }
  | { ok: false; error: "not_found" | "not_closed" | "already_selected" };

export async function runSelection(eventId: string): Promise<SelectionResult> {
  const result = await withTransaction(async (client) => {
    const evRes = await client.query("select * from events where id = $1 for update", [
      eventId,
    ]);
    const event = evRes.rows[0];
    if (!event) return { ok: false as const, error: "not_found" as const };
    if (event.status === "selected")
      return { ok: false as const, error: "already_selected" as const };

    // 締切済み(自動・手動どちらでも)であることが選定の前提
    const expired = new Date(event.closes_at) <= new Date();
    if (event.status !== "closed" && !(event.status === "open" && expired)) {
      return { ok: false as const, error: "not_closed" as const };
    }

    const appsRes = await client.query(
      `select id, email, applicant_name, token
       from applications
       where event_id = $1 and status = 'applied'
       order by applied_at asc
       for update`,
      [eventId]
    );
    const apps: {
      id: string;
      email: string;
      applicant_name: string;
      token: string;
    }[] = appsRes.rows;

    // 会員確認は申込時ではなくここ(選定時)で行う(2026-09-02 顧客方針):
    // 申込時に入力されたメールアドレスが会員名簿(CSV)に載っている申込だけを
    // 選定対象にし、載っていない申込は落選にする。
    // 名簿が未取込(0件)の場合は照合せず全員を対象にする(名簿運用前・デモ)。
    const rosterCount = (
      await client.query("select count(*)::int as c from member_allowlist")
    ).rows[0].c as number;
    let eligible = apps;
    let excluded: typeof apps = [];
    if (rosterCount > 0) {
      const emails = [...new Set(apps.map((a) => a.email.toLowerCase()))];
      const found = await client.query(
        "select email from member_allowlist where email = any($1)",
        [emails]
      );
      const inRoster = new Set(found.rows.map((r: { email: string }) => r.email));
      eligible = apps.filter((a) => inRoster.has(a.email.toLowerCase()));
      excluded = apps.filter((a) => !inRoster.has(a.email.toLowerCase()));
    }
    for (const app of excluded) {
      await client.query("update applications set status = 'lost' where id = $1", [
        app.id,
      ]);
      const mail = buildLostMail({
        event,
        applicantName: app.applicant_name,
        applicationToken: app.token,
      });
      await recordNotification(client, {
        applicationId: app.id,
        eventId,
        kind: "selection_lost",
        email: app.email,
        subject: mail.subject,
        body: mail.body,
      });
    }

    // 先着順: 申込日時の早い順(取得時に applied_at asc で並び済み)に
    // 定員まで当選、あふれた分は申込順の待機になる
    const winners = eligible.slice(0, event.capacity);
    const waitlisted = eligible.slice(event.capacity);

    for (const app of winners) {
      await client.query("update applications set status = 'won' where id = $1", [app.id]);
      await issueTicket(client, app.id);
      const mail = buildWinMail({
        event,
        applicantName: app.applicant_name,
        applicationToken: app.token,
      });
      await recordNotification(client, {
        applicationId: app.id,
        eventId,
        kind: "selection_won",
        email: app.email,
        subject: mail.subject,
        body: mail.body,
      });
    }
    for (let i = 0; i < waitlisted.length; i++) {
      const app = waitlisted[i];
      await client.query(
        "update applications set status = 'waitlisted', waitlist_order = $2 where id = $1",
        [app.id, i + 1]
      );
      const mail = buildWaitlistMail({
        event,
        applicantName: app.applicant_name,
        applicationToken: app.token,
      });
      await recordNotification(client, {
        applicationId: app.id,
        eventId,
        kind: "waitlist_info",
        email: app.email,
        subject: mail.subject,
        body: mail.body,
      });
    }
    await client.query("update events set status = 'selected' where id = $1", [eventId]);

    return {
      ok: true as const,
      winners: winners.length,
      waitlisted: waitlisted.length,
      excluded: excluded.length,
    };
  });

  if (!result.ok) return result;
  // メール送信はコミット後にキューで行う(無料枠の1日予算内)。
  // ここでは時間制限内に収まる分だけ先に流し、残りは手動送信ボタンか
  // 日次の Cron(/api/notify/process)が引き継ぐ
  await processNotificationQueue({ maxSends: 20 });
  return result;
}
