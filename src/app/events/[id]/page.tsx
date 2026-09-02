import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getEvent, effectiveStatus, isLottery, memberStatusLabel } from "@/lib/events";
import { getMyApplicationForEvent } from "@/lib/applications";
import { formatJst } from "@/lib/format";
import { applyAction } from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  closed: "募集は締め切られました",
  already: "このイベントにはすでに申し込み済みです",
  invalid_email: "メールアドレスの形式が正しくありません",
  not_found: "イベントが見つかりません",
  admin_cannot_apply: "運営者アカウントでは申し込みできません",
};

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ applied?: string; error?: string }>;
}) {
  const member = await requireMember();
  const { id } = await params;
  const { applied, error } = await searchParams;

  const event = await getEvent(id);
  if (!event || event.status === "draft") notFound();

  const myApplication = await getMyApplicationForEvent(id, member.id);
  const open = effectiveStatus(event) === "open";
  const remaining = Math.max(0, event.application_limit - event.application_count);

  return (
    <main className="container">
      <h1>
        {event.title}{" "}
        <span className="badge neutral">{memberStatusLabel(event)}</span>
      </h1>
      <div className="card">
        <p>
          日時: {formatJst(event.starts_at)}
          <br />
          会場: {event.venue}
          <br />
          定員: {event.capacity}名
          {isLottery(event) && <>(応募多数の場合は抽選)</>}
          <br />
          申込締切: {formatJst(event.closes_at)}
          <br />
          残り枠: {open ? `${remaining}枠` : "受付終了"}
        </p>
      </div>

      {applied && (
        <div className="notice success">
          申込が完了しました。
          <strong>
            抽選・繰上の結果は<Link href="/my">申込状況ページ</Link>で確認できます。
          </strong>
          当選された方にはメールでもお知らせします。
        </div>
      )}
      {error && (
        <div className="notice error">{errorMessages[error] ?? "エラーが発生しました"}</div>
      )}

      {member.role === "admin" ? (
        <div className="notice info">
          運営者アカウントのため申し込みはできません。
          <Link href={`/admin/events/${event.id}`}>管理画面でこのイベントを開く</Link>
        </div>
      ) : myApplication && !applied ? (
        <div className="notice info">
          このイベントには申し込み済みです。結果は
          <Link href="/my">申込状況ページ</Link>で確認できます。
        </div>
      ) : !myApplication && open ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>参加申込</h2>
          <p className="muted">
            入力していただくのは連絡先メールアドレスのみです。表示名はログイン中のアカウント(
            {member.display_name})を使用します。
          </p>
          <form action={applyAction} className="stack">
            <input type="hidden" name="eventId" value={event.id} />
            <label className="field">
              連絡先メールアドレス(当選のご連絡に使用します。Fans'
              に登録しているメールアドレスをご入力ください)
              <input
                type="email"
                name="email"
                required
                defaultValue={member.email}
                placeholder="you@example.com"
              />
            </label>
            <button type="submit">このイベントに申し込む</button>
          </form>
        </div>
      ) : !myApplication ? (
        <div className="notice info">このイベントの募集は締め切られています。</div>
      ) : null}
    </main>
  );
}
