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
  | { ok: false; error: "invalid_email" | "send_failed" };

/** ログイン用の確認リンクをメールで送る(名簿照合はしない。会員確認は選定時) */
export async function requestLoginLink(input: {
  email: string;
  displayName: string;
}): Promise<RequestLinkResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const token = randomBytes(24).toString("base64url");
  await query(
    `insert into login_tokens (email, display_name, token_hash, expires_at)
     values ($1, $2, $3, now() + interval '${TOKEN_TTL_MINUTES} minutes')`,
    [email, input.displayName.trim() || null, hashToken(token)]
  );

  const url = `${appUrl()}/auth/verify?token=${token}`;
  try {
    await getNotifyChannel().send({
      to: email,
      subject: "【ファンミ受付】ログインリンクのお知らせ",
      body: [
        "ファンミーティング参加受付システムへのログインリンクです。",
        `${TOKEN_TTL_MINUTES}分以内に下記のリンクを開いてください。`,
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
       returning email, display_name`,
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
        `insert into members (display_name, email, role)
         values ($1, $2, 'member')
         returning id, display_name, email, role, is_active`,
        [displayName, row.email]
      );
      member = created.rows[0];
    }
    return { ok: true as const, member };
  });
}
