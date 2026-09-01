// Fans'(fansnet.jp)会員向けの本番用認証: 参加コード + メール確認リンク。
//
// 調査結果(2026-09-01): Fans' は第三者向けの公開 API / OAuth / SSO を提供していない。
// そのため「Fans' アカウントでログイン」は直接実装できない。代わりに、
//   運営者が Fans' の会員限定投稿で「参加コード」を告知
//   → コードを見られるのは課金会員のみ
//   → 本システムでメール + 参加コードを入力 → 確認リンクをメール送信
//   → リンクを開いた時点で会員として登録・ログイン
// という形で、会員判定を Fans' のペイウォールに委ねる。
// TODO(hearing:Q1): ベンダー(ロココ社)への連携可否の正式確認、X(Twitter)ログイン案の要否
// TODO(hearing:Q2): 退会者の無効化運用(参加コードのローテーション / is_active の手動更新)
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import { appUrl } from "@/lib/config";
import { getNotifyChannel } from "@/lib/notify/channel";
import { getJoinCode } from "@/lib/settings";
import { allowlistCount, allowlistLookup } from "@/lib/allowlist";
import type { Member } from "./provider";

const TOKEN_TTL_MINUTES = 15;

export function authMode(): "mock" | "fans_code" {
  return process.env.AUTH_MODE === "fans_code" ? "fans_code" : "mock";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function joinCodeMatches(input: string): Promise<boolean | "unset"> {
  // 参加コードは管理画面(認証設定)で運営者が設定・自動生成する
  const expected = await getJoinCode();
  if (!expected) return "unset";
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type RequestLinkResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "invalid_code"
        | "invalid_email"
        | "send_failed"
        | "code_unset"
        | "not_member"
        | "not_member_or_code";
    };

/** 参加コードを検証し、ログイン用の確認リンクをメールで送る */
export async function requestLoginLink(input: {
  email: string;
  displayName: string;
  joinCode: string;
}): Promise<RequestLinkResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  // 会員判定は「名簿 または 参加コード」:
  //   1. 会員名簿(Fans' の CSV)に載っているメール → それだけで会員(コード不要)
  //   2. 名簿に載っていない → 参加コードが合えば通す(名簿なし運用・名簿未更新の新会員の救済)
  //   3. 運営者(role=admin)は Fans' の名簿に載らないため常に免除
  const isAdmin =
    (
      await query(
        "select 1 from members where lower(email) = $1 and role = 'admin' and is_active",
        [email]
      )
    ).length > 0;
  const onRoster =
    (await allowlistCount()) > 0 && (await allowlistLookup(email)) !== null;

  if (!isAdmin && !onRoster) {
    const codeCheck = await joinCodeMatches(input.joinCode.trim());
    if (codeCheck === "unset") {
      // コード未設定: 名簿運用のみ
      return { ok: false, error: (await allowlistCount()) > 0 ? "not_member" : "code_unset" };
    }
    if (!codeCheck) {
      return {
        ok: false,
        error: (await allowlistCount()) > 0 ? "not_member_or_code" : "invalid_code",
      };
    }
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
