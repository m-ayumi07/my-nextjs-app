// app/preview/route.js
// 役割：保存済みの今日のデータをBlobから読み、黒×青ネオンのHTMLで返す保護付きページ
// アクセス：/preview?key=<PREVIEW_KEY>

// データが無い日に返す「空」ページ（同じ黒×青ネオンデザイン）
function emptyHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Content Preview</title>
<style>
  body {
    background: #0a0a0f;
    color: #e8e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
  }
  .msg { text-align: center; }
  .msg h1 {
    color: #19e0ff;
    text-shadow: 0 0 12px #19e0ff88;
    font-size: 1.4rem;
    margin-bottom: 12px;
  }
  .msg p { color: #555570; font-size: 0.9rem; line-height: 1.8; }
</style>
</head>
<body>
<div class="msg">
  <h1>⚡ Content Preview</h1>
  <p>本日のデータはまだありません。<br>朝の自動生成が完了すると表示されます。</p>
</div>
</body>
</html>`;
}

export async function GET(request) {
  // ① 鍵チェック：?key= が PREVIEW_KEY と一致しなければ 401
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!process.env.PREVIEW_KEY || key !== process.env.PREVIEW_KEY) {
    return new Response('unauthorized', { status: 401 });
  }

  try {
    // ② 保存済みデータを読む（CommonJS → 動的 import、既存ルートと同じパターン）
    const { loadDaily }     = await import('@/lib/store.js');
    const { renderPreview } = await import('@/lib/render-preview.js');

    const data = await loadDaily(); // 今日(JST)のデータ。無ければ null

    // ③ データがなければ「まだありません」ページを返す（落ちない）
    if (!data) {
      return new Response(emptyHtml(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ④ renderPreview でHTML化して返す
    const html = renderPreview(data);
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (e) {
    console.error('preview route error:', e.message);
    return new Response('server error: ' + e.message, { status: 500 });
  }
}
