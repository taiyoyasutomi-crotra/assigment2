import { Pool, type PoolClient } from "pg";

declare global {
  // Next.js の dev サーバーはモジュールを再評価するため global に保持する
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL が設定されていません");
    const ssl =
      process.env.DATABASE_SSL === "true" || /supabase\.(co|com)/.test(url)
        ? { rejectUnauthorized: false }
        : undefined;
    global.__pgPool = new Pool({ connectionString: url, ssl, max: 5 });
  }
  return global.__pgPool;
}

export async function query<T = any>(sql: string, params?: unknown[]) {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}

// 締切判定・選定・繰上はすべてこのトランザクション内で行う。
// 行ロック(SELECT ... FOR UPDATE)前提の処理はここを経由すること。
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
