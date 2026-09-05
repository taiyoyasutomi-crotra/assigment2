import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // 会員ノーログイン化(2026-09-05)で廃止した旧ページへのリンク・ブックマーク対策。
  // 404 ではなくトップ(イベント一覧)へ案内する
  async redirects() {
    return [
      { source: "/my", destination: "/", permanent: false },
      { source: "/my/:path*", destination: "/", permanent: false },
      { source: "/notifications", destination: "/", permanent: false },
      { source: "/account", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
