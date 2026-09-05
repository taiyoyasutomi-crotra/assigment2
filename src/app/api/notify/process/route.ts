// 送信キューの処理エンドポイント。Vercel Cron が毎日呼び出し、
// 無料枠の1日予算内で送信待ちメールを流す(vercel.json の crons を参照)。
// 認証は付けていない: 呼ばれても「送信待ちを予算内で送る」以外の作用はなく、
// 本文や宛先には触れられない(モックの割り切り。本実装では CRON_SECRET を検証する)。
import { processNotificationQueue } from "@/lib/notify/notifications";

export const dynamic = "force-dynamic";
// 毎秒2リクエスト制限(Resend)に合わせて送信間隔をあけるため、実行時間を長めに取る
export const maxDuration = 60;

export async function GET() {
  const result = await processNotificationQueue();
  return Response.json(result);
}
