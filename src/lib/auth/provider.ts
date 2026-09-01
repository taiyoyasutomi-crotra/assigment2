// 認証アダプタ。
// モックではシードした会員一覧から選んでログインする(パスワードなし)。
// 本実装ではこのファイルをコミュニティ基盤の OAuth に差し替える。
// TODO(hearing:Q1): コミュニティ基盤の特定
// TODO(hearing:Q2): 会員資格の検証方法(現状は is_active フラグ)
import { query } from "@/lib/db";

export type Member = {
  id: string;
  display_name: string;
  email: string;
  role: "member" | "admin";
  is_active: boolean;
};

export interface AuthProvider {
  /** モック専用: ログイン画面に出す会員候補 */
  listLoginCandidates(): Promise<Member[]>;
  /** 資格確認込みの認証。無効なら null */
  authenticate(memberId: string): Promise<Member | null>;
  getMember(memberId: string): Promise<Member | null>;
}

const mockProvider: AuthProvider = {
  async listLoginCandidates() {
    return query<Member>(
      "select id, display_name, email, role, is_active from members where is_active order by role desc, display_name"
    );
  },
  async authenticate(memberId: string) {
    const rows = await query<Member>(
      "select id, display_name, email, role, is_active from members where id = $1 and is_active",
      [memberId]
    );
    return rows[0] ?? null;
  },
  async getMember(memberId: string) {
    const rows = await query<Member>(
      "select id, display_name, email, role, is_active from members where id = $1 and is_active",
      [memberId]
    );
    return rows[0] ?? null;
  },
};

export const authProvider: AuthProvider = mockProvider;
