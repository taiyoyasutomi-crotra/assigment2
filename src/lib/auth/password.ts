// パスワードのハッシュ化と照合。外部依存を増やさないため Node 標準の scrypt を使う。
// 保存形式: "scrypt$<salt>$<hash>"(生パスワードは保存しない)
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 8;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const calc = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "base64url");
  return calc.length === expected.length && timingSafeEqual(calc, expected);
}
