// 参加者選定(F4)。
// - 先着(application_limit = capacity): 全員当選
// - 抽選(application_limit > capacity): capacity 人を無作為に当選、残りは待機
// 当選者にのみ通知を送る。待機者・落選者にはメールしない(申込状況画面で確認)。
// 選定は 1 イベント 1 回のみ。イベント行ロック + status 遷移で二重実行を防ぐ。
import { randomInt } from "node:crypto";
import { withTransaction } from "@/lib/db";
import { buildWinMail } from "@/lib/mail";
import { issueTicket } from "@/lib/tickets";
import { recordNotification, deliverAll } from "@/lib/notify/notifications";

export type SelectionResult =
  | { ok: true; winners: number; waitlisted: number; excluded: number }
  | { ok: false; error: "not_found" | "not_closed" | "already_selected" };

export async function runSelection(eventId: string): Promise<SelectionResult> {
  const result = await withTransaction(async (client) => {
    const evRes = await client.query("select * from events where id = $1 for update", [
      eventId,
    ]);
    const event = evRes.rows[0];
    if (!event) return { ok: false as const, error: "not_found" as const, ids: [] };
    if (event.status === "selected")
      return { ok: false as const, error: "already_selected" as const, ids: [] };

    // 締切済み(自動・手動どちらでも)であることが選定の前提
    const expired = new Date(event.closes_at) <= new Date();
    if (event.status !== "closed" && !(event.status === "open" && expired)) {
      return { ok: false as const, error: "not_closed" as const, ids: [] };
    }

    const appsRes = await client.query(
      `select a.id, a.member_id, a.email, m.display_name
       from applications a join members m on m.id = a.member_id
       where a.event_id = $1 and a.status = 'applied'
       order by a.applied_at asc
       for update of a`,
      [eventId]
    );
    const apps: {
      id: string;
      member_id: string;
      email: string;
      display_name: string;
    }[] = appsRes.rows;

    // 会員確認はログイン時ではなくここ(選定時)で行う(2026-09-02 顧客方針):
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
    }

    // 抽選: crypto の乱数で Fisher–Yates シャッフル
    // 先着(limit = capacity)は自動締切により申込数 <= capacity のため全員当選になる
    const pool = [...eligible];
    if (event.application_limit > event.capacity) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    const winners = pool.slice(0, event.capacity);
    const waitlisted = pool.slice(event.capacity);

    const notificationIds: string[] = [];
    for (const app of winners) {
      await client.query("update applications set status = 'won' where id = $1", [app.id]);
      const ticket = await issueTicket(client, app.id);
      const mail = buildWinMail({
        event,
        displayName: app.display_name,
        ticketId: ticket.id,
        kind: "selection_won",
      });
      notificationIds.push(
        await recordNotification(client, {
          memberId: app.member_id,
          eventId,
          kind: "selection_won",
          email: app.email,
          subject: mail.subject,
          body: mail.body,
        })
      );
    }
    for (let i = 0; i < waitlisted.length; i++) {
      await client.query(
        "update applications set status = 'waitlisted', waitlist_order = $2 where id = $1",
        [waitlisted[i].id, i + 1]
      );
    }
    await client.query("update events set status = 'selected' where id = $1", [eventId]);

    return {
      ok: true as const,
      winners: winners.length,
      waitlisted: waitlisted.length,
      excluded: excluded.length,
      ids: notificationIds,
    };
  });

  // メール配送はコミット後。失敗しても DB はロールバックしない(通知履歴に failed が残る)
  if (result.ok) await deliverAll(result.ids);
  const { ids: _ids, ...rest } = result;
  return rest as SelectionResult;
}
