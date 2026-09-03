// セッション管理。HMAC 署名付き Cookie に会員 ID を保持する。
// 認証方式(provider.ts)を差し替えてもここはそのまま使える。
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authProvider, type Member } from "./provider";

const COOKIE_NAME = "fm_session";
// 90日。メール確認リンク方式のため再ログインの手間が大きく、長めに保持する
const SESSION_HOURS = 24 * 90;

function secret(): string {
  return process.env.AUTH_SECRET || "dev-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function createSession(memberId: string) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = `${memberId}.${exp}`;
  const value = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_HOURS * 3600,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionMember(): Promise<Member | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [memberId, expStr, sig] = parts;
  const expected = sign(`${memberId}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Date.now()) return null;
  return authProvider.getMember(memberId);
}

/** ログイン後の行き先。受付担当は担当イベントの受付画面に直行させる */
export function roleHome(member: Member): string {
  if (member.role === "admin") return "/admin/events";
  if (member.role === "checkin") {
    return member.checkin_event_id
      ? `/admin/events/${member.checkin_event_id}/checkin`
      : "/login";
  }
  return "/";
}

/** ログイン必須ページ(会員向け)用。未ログインなら /login へ。受付担当は会員画面に入れない */
export async function requireMember(): Promise<Member> {
  const member = await getSessionMember();
  if (!member) redirect("/login");
  if (member.role === "checkin") redirect(roleHome(member));
  return member;
}

/** 管理画面・管理系アクション用。運営者ロール以外は弾く(サーバー側判定) */
export async function requireAdmin(): Promise<Member> {
  const member = await getSessionMember();
  if (!member) redirect("/login");
  if (member.role !== "admin") redirect(roleHome(member));
  return member;
}

/** 受付画面(QR読取・参加者ボード)へのアクセス可否。API 用の真偽値判定 */
export function canCheckin(member: Member | null, eventId: string): boolean {
  if (!member) return false;
  if (member.role === "admin") return true;
  return member.role === "checkin" && member.checkin_event_id === eventId;
}

/** 受付画面用。運営者、またはこのイベント担当の受付アカウントのみ通す */
export async function requireCheckinAccess(eventId: string): Promise<Member> {
  const member = await getSessionMember();
  if (!member) redirect("/login");
  if (!canCheckin(member, eventId)) redirect(roleHome(member));
  return member;
}
