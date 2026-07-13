// app/api/morning/route.js
// 役割：毎朝Cronの入口。合言葉(CRON_SECRET)が合う相手だけ runMorning を実行する。
import { runMorning } from '../../../lib/run-morning';
export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
  }
  try {
    const result = await runMorning();
    return new Response(JSON.stringify({ ok: true, topic: result.topic?.title }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
}
