// lib/store.js — 朝つくった記事を「保管箱(Vercel Blob・Private)」に入れて、あとで取り出す
// Private = 公開URLが無く、トークンを持つこのコードからしか読めない
// 日本時間の「今日」を YYYY-MM-DD で返す（朝の保存と昼の表示で同じ鍵を使うため）
function jstDate() {
  const ms = Date.now() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
function pathFor(dateStr) {
  return `preview/${dateStr || jstDate()}.json`;
}
// 保存：今日のぶんを保管箱(Private)に入れる
async function saveDaily(data) {
  const { put } = await import('@vercel/blob');
  const pathname = pathFor();
  const body = JSON.stringify({ ...data, savedAt: new Date().toISOString() });
  const res = await put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
  });
  return res.url;
}
// 取り出し：今日のぶんを箱から出す（無ければ null）
async function loadDaily(dateStr) {
  const { get } = await import('@vercel/blob');
  const pathname = pathFor(dateStr);
  try {
    const result = await get(pathname, { access: 'private' });
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (e) {
    return null; // まだ無い／読めない
  }
}
module.exports = { saveDaily, loadDaily, jstDate, pathFor };
// 単体テスト：ターミナルで `node lib/store.js`
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' });
  (async () => {
    try {
      const url = await saveDaily({ hello: 'world', n: 1 });
      console.log('① 保存OK →', url);
      const back = await loadDaily();
      console.log('② 読み出しOK →', back);
      console.log('③ 日付キー →', jstDate());
    } catch (e) {
      console.error('NG:', e.message);
    }
  })();
}
