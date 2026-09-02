// 会員名簿(CSVエクスポート)取り込み。
// 会員判定の正はこの名簿: 名簿に載っているメールアドレスだけがログインできる。
// 新会員の追加・退会者の除外は最新 CSV の再取り込みで反映する(洗い替え)。
//
// 実CSV(顧客提示のユーザー一覧)の列構成に対応:
//   氏名, 表示名, メールアドレス, 携帯電話番号, 性別, 生年月日, ..., 入会日, 退会日,
//   お届け先/氏名, お届け先/電話番号, お届け先/メールアドレス, お届け先/郵便番号, お届け先/住所, ...
// - 保存するのは「メールアドレス」と「表示名」の2列のみ。氏名(本名)・電話・住所・
//   生年月日等の個人情報は読み捨てて一切保存しない(NFR-04)
// - 「お届け先/メールアドレス」は連絡先ではないため使わない
// - 「退会日」が入っている行はスキップ(退会者)
import { query } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function allowlistSummary(): Promise<{
  count: number;
  lastImportedAt: Date | null;
}> {
  const rows = await query<{ c: number; last: Date | null }>(
    "select count(*)::int as c, max(imported_at) as last from member_allowlist"
  );
  return { count: rows[0].c, lastImportedAt: rows[0].last };
}

export async function allowlistLookup(
  email: string
): Promise<{ email: string; display_name: string | null } | null> {
  const rows = await query(
    "select email, display_name from member_allowlist where email = $1",
    [email.toLowerCase()]
  );
  return rows[0] ?? null;
}

/**
 * 最小限の CSV パース(RFC 4180 相当)。
 * 引用符内のカンマ・改行・"" エスケープに対応。区切りはカンマ/タブ/セミコロン
 * (スプレッドシートからのコピペはタブ区切りになるため)。
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((f) => f !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === "," || c === "\t" || c === ";") {
      pushField();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += c;
    }
  }
  pushRow();
  return rows;
}

export function parseRosterCsv(
  text: string
): { email: string; displayName: string | null }[] {
  const rows = parseCsvRows(text.replace(/^﻿/, ""));
  if (rows.length === 0) return [];

  // ヘッダー行の解析: 「メールアドレス」列(お届け先を除く)と「表示名」列を特定する
  const header = rows[0].map((h) => h.replace(/\s/g, ""));
  const isDelivery = (h: string) => /お届け先|届け先|送付先/.test(h);
  const emailIdx = header.findIndex(
    (h) => /メール|e-?mail/i.test(h) && !isDelivery(h)
  );
  const nameIdx = header.findIndex(
    (h) => /表示名|ニックネーム|ハンドル/.test(h) && !isDelivery(h)
  );
  const leaveIdx = header.findIndex((h) => /退会日|退会/.test(h) && !isDelivery(h));

  const seen = new Map<string, string | null>();

  if (emailIdx >= 0) {
    // ヘッダーあり: 列指定で読む。表示名列がなければ null
    // (氏名=本名の列には意図的にフォールバックしない。本名は保存しない方針)
    for (const row of rows.slice(1)) {
      const email = (row[emailIdx] ?? "").trim();
      if (!EMAIL_RE.test(email)) continue;
      if (leaveIdx >= 0 && (row[leaveIdx] ?? "").trim() !== "") continue; // 退会者
      const name = nameIdx >= 0 ? (row[nameIdx] ?? "").trim() : "";
      seen.set(email.toLowerCase(), name || null);
    }
  } else {
    // ヘッダーなし: 行内のメール形式フィールドを探し、別の非数値フィールドを表示名とみなす
    for (const row of rows) {
      const email = row.find((f) => EMAIL_RE.test(f));
      if (!email) continue;
      const name =
        row.find((f) => f && f !== email && !EMAIL_RE.test(f) && !/^\d+$/.test(f)) ??
        null;
      seen.set(email.toLowerCase(), name);
    }
  }

  return [...seen.entries()].map(([email, displayName]) => ({ email, displayName }));
}

export async function replaceAllowlist(
  rows: { email: string; displayName: string | null }[]
): Promise<number> {
  await query("delete from member_allowlist");
  for (const r of rows) {
    await query(
      `insert into member_allowlist (email, display_name) values ($1, $2)
       on conflict (email) do update set display_name = excluded.display_name, imported_at = now()`,
      [r.email, r.displayName]
    );
  }
  return rows.length;
}

export async function clearAllowlist(): Promise<void> {
  await query("delete from member_allowlist");
}
