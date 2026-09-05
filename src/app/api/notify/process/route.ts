// 送信キューの処理エンドポイント。
// - 管理画面(QueueSender)が繰り返し呼び、予算内なら当日中にメールを送り切る
// - Vercel Cron も毎日呼び出す(管理画面を開かなかった場合の保険。vercel.json)
// 1回の呼び出しで処理するのは実行時間制限(60秒)に収まる分だけで、
// 残りは次の呼び出しが引き継ぐ。多重呼び出しは行の確保で排他される。
// 認証は付けていない: 呼ばれても「送信待ちを予算内で送る」以外の作用はなく、
// 本文や宛先には触れられない(モックの割り切り。本実装では CRON_SECRET を検証する)。
import { processNotificationQueue } from "@/lib/notify/notifications";

export const dynamic = "force-dynamic";
// 毎秒のレート制限に合わせて送信間隔をあけるため、実行時間を長めに取る
export const maxDuration = 60;

async function process() {
  const result = await processNotificationQueue({
    maxSends: 70,
    timeBudgetMs: 45_000,
  });
  return Response.json(result);
}

export async function GET() {
  return process();
}

export async function POST() {
  return process();
}
