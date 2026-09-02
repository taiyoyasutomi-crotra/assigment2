// Fans'(fansnet.jp)会員向けの本番用認証: メール確認リンク。
//
// 調査結果(2026-09-01): Fans' は第三者向けの公開 API / OAuth / SSO を提供していない。
// そのため「Fans' アカウントでログイン」は直接実装できない。
// ログインリンクは誰でも受け取れる(名簿照合しない)。会員かどうかの確認は
// ログイン時ではなく選定(抽選)時に、申込メールアドレスを名簿(CSV)と照合して行う
// (2026-09-02 顧客方針: 名簿CSVの更新前に入会した新会員がログインすら
//  できなくなるのを避ける。→ lib/selection.ts)
// ※「参加コード」方式は流出時に非会員が入れてしまうため不採用(顧客判断 2026-09-01)
// TODO(hearing:Q1): ベンダー(ロココ社)への連携可否の正式確認(API があれば CSV 再取込を自動化できる)
// TODO(hearing:Q2): CSV 再取込の運用頻度(新会員の反映・退会者の除外はいずれも再取込で行う)
import { createHash, randomBytes } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import { appUrl } from "@/lib/config";
import { getNotifyChannel } from "@/lib/notify/channel";
import { hashPassword, verifyPassword } from "./password";
import type { Member } from "./provider";

const TOKEN_TTL_MINUTES = 15;

export function authMode(): "mock" | "fans_code" {
  return process.env.AUTH_MODE === "fans_code" ? "fans_code" : "mock";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type RequestLinkResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "invalid_email"
        | "send_failed"
        | "not_registered"
        | "already_registered";
    };

/**
 * 確認リンクをメールで送る(名簿照合はしない。会員確認は選定時)。
 * - mode "login": 登録済みのみ。開くとログイン
 * - mode "signup": 未登録のみ(登録済みの二重作成を防ぐ)。開くと登録完了
 * - mode "reset": 登録済みのみ。開くとパスワード再設定画面
 */
export async function requestLoginLink(input: {
  email: string;
  displayName: string;
  mode: "login" | "signup" | "reset";
  /** signup 時のみ: 設定するパスワードのハッシュ(確認リンクを開いた時点で会員に設定) */
  passwordHash?: string | null;
}): Promise<RequestLinkResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const registered =
    (
      await query("select 1 from members where lower(email) = $1 limit 1", [email])
    ).length > 0;
  if (input.mode !== "signup" && !registered) {
    return { ok: false, error: "not_registered" };
  }
  if (input.mode === "signup" && registered) {
    return { ok: false, error: "already_registered" };
  }

  const token = randomBytes(24).toString("base64url");
  await query(
    `insert into login_tokens (email, display_name, password_hash, purpose, token_hash, expires_at)
     values ($1, $2, $3, $4, $5, now() + interval '${TOKEN_TTL_MINUTES} minutes')`,
    [
      email,
      input.displayName.trim() || null,
      input.passwordHash ?? null,
      input.mode,
      hashToken(token),
    ]
  );

  const url =
    input.mode === "reset"
      ? `${appUrl()}/auth/reset?token=${token}`
      : `${appUrl()}/auth/verify?token=${token}`;
  const texts = {
    login: {
      subject: "【ファンミ受付】ログインリンクのお知らせ",
      lead: "ファンミーティング参加受付システムへのログインリンクです。",
      action: "ログイン",
    },
    signup: {
      subject: "【ファンミ受付】アカウント登録の確認",
      lead: "ファンミーティング参加受付システムのアカウント登録を受け付けました。",
      action: "登録を完了",
    },
    reset: {
      subject: "【ファンミ受付】パスワード再設定のご案内",
      lead: "パスワード再設定の受付をしました。",
      action: "新しいパスワードを設定",
    },
  }[input.mode];
  try {
    await getNotifyChannel().send({
      to: email,
      subject: texts.subject,
      body: [
        texts.lead,
        `${TOKEN_TTL_MINUTES}分以内に下記のリンクを開いて${texts.action}してください。`,
        "",
        url,
        "",
        "このメールに心当たりがない場合は破棄してください。",
      ].join("\n"),
    });
  } catch {
    return { ok: false, error: "send_failed" };
  }
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; member: Member }
  | { ok: false; error: "invalid_token" };

/** 確認リンクのトークンを検証し、会員を登録(初回)またはログインさせる */
export async function verifyLoginToken(token: string): Promise<VerifyResult> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `update login_tokens set used_at = now()
       where token_hash = $1 and used_at is null and expires_at > now()
         and purpose <> 'reset'
       returning email, display_name, password_hash`,
      [hashToken(token)]
    );
    const row = res.rows[0];
    if (!row) return { ok: false as const, error: "invalid_token" as const };

    const existing = await client.query(
      `select id, display_name, email, role, is_active
       from members where lower(email) = $1 order by created_at limit 1`,
      [row.email]
    );
    let member: Member;
    if (existing.rows[0]) {
      if (!existing.rows[0].is_active) {
        // 資格停止中の会員はログイン不可 TODO(hearing:Q2)
        return { ok: false as const, error: "invalid_token" as const };
      }
      member = existing.rows[0];
    } else {
      // 初回ログイン: 会員として自動登録。
      // 表示名は 名簿(Fans' CSV)の表示名 > 自己申告 > メールのローカル部 の順で採用
      const roster = await client.query(
        "select display_name from member_allowlist where email = $1",
        [row.email]
      );
      const displayName =
        roster.rows[0]?.display_name ||
        row.display_name ||
        row.email.split("@")[0];
      const created = await client.query(
        `insert into members (display_name, email, role, password_hash)
         values ($1, $2, 'member', $3)
         returning id, display_name, email, role, is_active`,
        [displayName, row.email, row.password_hash ?? null]
      );
      member = created.rows[0];
    }
    return { ok: true as const, member };
  });
}

export type PasswordLoginResult =
  | { ok: true; member: Member }
  | { ok: false; error: "invalid_credentials" | "password_not_set" };

/** メールアドレス+パスワードでのログイン */
export async function loginWithPassword(input: {
  email: string;
  password: string;
}): Promise<PasswordLoginResult> {
  const email = input.email.trim().toLowerCase();
  const rows = await query<Member & { password_hash: string | null }>(
    `select id, display_name, email, role, is_active, password_hash
     from members where lower(email) = $1 and is_active
     order by created_at limit 1`,
    [email]
  );
  const row = rows[0];
  if (!row) return { ok: false, error: "invalid_credentials" };
  if (!row.password_hash) return { ok: false, error: "password_not_set" };
  if (!verifyPassword(input.password, row.password_hash)) {
    return { ok: false, error: "invalid_credentials" };
  }
  const { password_hash: _ph, ...member } = row;
  return { ok: true, member };
}

/** ログイン中の会員のパスワードを設定/変更する(メールリンクで入った人の再設定にも使う) */
export async function setPassword(memberId: string, password: string): Promise<void> {
  await query("update members set password_hash = $2 where id = $1", [
    memberId,
    hashPassword(password),
  ]);
}

/** パスワード再設定トークンの事前確認(消費しない)。画面表示用 */
export async function peekResetToken(token: string): Promise<{ email: string } | null> {
  const rows = await query<{ email: string }>(
    `select email from login_tokens
     where token_hash = $1 and used_at is null and expires_at > now() and purpose = 'reset'`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

export type ResetPasswordResult =
  | { ok: true; member: Member }
  | { ok: false; error: "invalid_token" };

/** 再設定トークンを消費して新パスワードを設定し、そのままログインさせる */
export async function resetPasswordWithToken(
  token: string,
  password: string
): Promise<ResetPasswordResult> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `update login_tokens set used_at = now()
       where token_hash = $1 and used_at is null and expires_at > now() and purpose = 'reset'
       returning email`,
      [hashToken(token)]
    );
    const row = res.rows[0];
    if (!row) return { ok: false as const, error: "invalid_token" as const };
    const updated = await client.query(
      `update members set password_hash = $2
       where id = (select id from members where lower(email) = $1 and is_active
                   order by created_at limit 1)
       returning id, display_name, email, role, is_active`,
      [row.email, hashPassword(password)]
    );
    if (!updated.rows[0]) return { ok: false as const, error: "invalid_token" as const };
    return { ok: true as const, member: updated.rows[0] as Member };
  });
}
