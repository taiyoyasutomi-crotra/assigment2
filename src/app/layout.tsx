import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSessionMember } from "@/lib/auth/session";
import { logoutAction } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "ファンミーティング参加受付",
  description: "コミュニティイベントの申込・抽選・QR受付システム(モック)",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getSessionMember();
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              ファンミ受付
            </Link>
            <nav>
              <Link href="/">ホーム</Link>
              {member && <Link href="/my">申込状況</Link>}
              {/* 管理(イベント管理・運営者の追加/削除・名簿CSV取込)は運営者のみ */}
              {member?.role === "admin" && <Link href="/admin/events">管理</Link>}
            </nav>
            <div className="user">
              {member ? (
                <>
                  <span>{member.display_name}</span>
                  <form action={logoutAction}>
                    <button type="submit" className="secondary small">
                      ログアウト
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login">ログイン</Link>
              )}
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
