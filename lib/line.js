// lib/line.js
// 役割：①自分のLINEに通知を送る ②あとでOK受信に使う署名チェック
const crypto = require('crypto');
// ① 自分のLINEに通知を送る（broadcast＝友だち全員へ。友だちは自分だけなので自分宛て）
async function pushLine(text) {
  const token = process.env.LINE_CHANNEL_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_TOKEN がありません（環境変数を確認）');
  const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ type: 'text', text: String(text).slice(0, 5000) }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE送信失敗 status=${res.status} body=${detail}`);
  }
  return true;
}
// ② Webhookの署名チェック（後日OK受信で使う。今は置いておくだけ）
// channel secret を鍵に、本文(raw)からハッシュを作り、届いた署名と一致するか確認する
function verifySignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) throw new Error('LINE_CHANNEL_SECRET がありません（環境変数を確認）');
  const expected = crypto
    .createHmac('SHA256', secret)
    .update(rawBody) // ★必ず「生の本文」を渡す（JSON.parseする前のもの）
    .digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { pushLine, verifySignature };
// ③ テスト：このファイルを直接 node で動かしたときだけ走る
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' });
  pushLine('✅ テスト通知：line.js は動いています（' + new Date().toLocaleString('ja-JP') + '）')
    .then(() => console.log('送信OK：スマホのLINEを確認してください'))
    .catch((e) => console.error('送信エラー：', e.message));
}
