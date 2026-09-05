import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSessionMember, roleHome } from "@/lib/auth/session";
import { logoutAction } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "ファンミーティング参加受付",
  description: "コミュニティイベントの申込・先着受付・QR受付システム(モック)",
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
              {/* 受付担当: 担当イベントの受付画面のみ(他の画面には入れない) */}
              {member?.role === "checkin" ? (
                <Link href={roleHome(member)}>受付画面</Link>
              ) : (
                <>
                  <Link href="/">ホーム</Link>
                  {/* 運営者: イベント(一覧・作成)と管理(運営者・名簿・自分のパスワード) */}
                  {member?.role === "admin" && (
                    <Link href="/admin/events">イベント</Link>
                  )}
                  {member?.role === "admin" && (
                    <Link href="/admin/settings">管理</Link>
                  )}
                </>
              )}
            </nav>
            {/* 会員はログイン不要のため、未ログイン時はログイン導線を出さない
                (運営者・受付担当は /login に直接アクセスする) */}
            {member && (
              <div className="user">
                <span>{member.display_name}</span>
                <form action={logoutAction}>
                  <button type="submit" className="secondary small">
                    ログアウト
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
