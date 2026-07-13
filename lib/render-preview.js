// lib/render-preview.js
// 役割：保存済みデータを受け取り、黒×青ネオンのプレビューHTML文字列を返す
// 生成・ファイル書き出しは一切しない。return するだけ。

// ─────────────────────────────────────────
// HTMLエスケープ
// ─────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────
// Markdown 簡易変換（## 見出し / **太字** / *イタリック* / 改行）
// ─────────────────────────────────────────
function mdToHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/\n{2,}/g, '\n\n')
    .replace(/\n/g, '<br>');
}

// ─────────────────────────────────────────
// バッジ
// ─────────────────────────────────────────
function badge(result) {
  return result === 'pass'
    ? '<span class="badge pass">✓ pass</span>'
    : '<span class="badge ng">⚠ 要確認</span>';
}

// ─────────────────────────────────────────
// タグpill
// ─────────────────────────────────────────
function tagPills(tags = []) {
  return tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ');
}

// ─────────────────────────────────────────
// 楽天ROOMカード
// ─────────────────────────────────────────
function buildRoomCard(room) {
  if (!room) return '';
  const { product = {}, room_text = '', result, issues = [] } = room;
  const copyText = esc(`${room_text}\n\n${product.affiliateUrl ?? ''}`);

  return `
<div class="card">
  <div class="card-header">
    <span class="media-label">楽天ROOM</span>
    ${badge(result)}
    ${issues.length ? `<span class="issues-hint">issues: ${esc(issues.join(' / '))}</span>` : ''}
  </div>

  ${product.image ? `<img class="product-img" src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy">` : ''}

  <div class="product-meta">
    <div class="product-name">${esc(product.name ?? '')}</div>
    <div class="product-price">¥${Number(product.price ?? 0).toLocaleString()}
      <span class="review">★${product.reviewAverage ?? '-'}（${product.reviewCount ?? 0}件）</span>
    </div>
    ${product.affiliateUrl
      ? `<a class="affiliate-link" href="${esc(product.affiliateUrl)}" target="_blank" rel="noopener">楽天市場で見る →</a>`
      : ''}
  </div>

  <div class="room-text">${esc(room_text)}</div>

  <button class="copy-btn" onclick="copyText(this, \`${copyText}\`)">コピー</button>
</div>`;
}

// ─────────────────────────────────────────
// note カード
// ─────────────────────────────────────────
function buildNoteCard(note) {
  if (!note) return '';
  const { topic, title = '', body = '', tags = [], result, issues = [] } = note;
  const copyContent = esc(body);

  return `
<div class="card">
  <div class="card-header">
    <span class="media-label">note</span>
    ${badge(result)}
    ${issues.length ? `<span class="issues-hint">issues: ${esc(issues.join(' / '))}</span>` : ''}
  </div>
  <div class="topic-label">分野：${esc(topic ?? '')}</div>
  <h2 class="article-title">${esc(title)}</h2>
  <div class="tags">${tagPills(tags)}</div>
  <div class="article-body">${mdToHtml(body)}</div>
  <button class="copy-btn" onclick="copyText(this, \`${copyContent}\`)">コピー</button>
</div>`;
}

// ─────────────────────────────────────────
// Medium カード
// ─────────────────────────────────────────
function buildMediumCard(medium) {
  if (!medium) return '';
  const { topic, title = '', body = '', tags = [], result, issues = [] } = medium;
  const copyContent = esc(body);

  return `
<div class="card">
  <div class="card-header">
    <span class="media-label">Medium</span>
    ${badge(result)}
    ${issues.length ? `<span class="issues-hint">issues: ${esc(issues.join(' / '))}</span>` : ''}
  </div>
  <div class="topic-label">Topic: ${esc(topic ?? '')}</div>
  <h2 class="article-title">${esc(title)}</h2>
  <div class="tags">${tagPills(tags)}</div>
  <div class="article-body">${mdToHtml(body)}</div>
  <button class="copy-btn" onclick="copyText(this, \`${copyContent}\`)">コピー</button>
</div>`;
}

// ─────────────────────────────────────────
// メイン関数
// ─────────────────────────────────────────
function renderPreview(data) {
  const { topic, room, note, medium } = data ?? {};
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const topicBlock = topic ? `
<div class="topic-bar">
  <span class="topic-score">score: ${esc(String(topic.jp_score ?? ''))}</span>
  <span class="topic-title">【今日のネタ】${esc(topic.title ?? '')}</span>
  <span class="topic-reason">${esc(topic.reason ?? '')}</span>
</div>` : '';

  const cards = [
    buildRoomCard(room),
    buildNoteCard(note),
    buildMediumCard(medium),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Content Preview — ${esc(now)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0a0a0f;
    color: #e8e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.7;
    padding: 32px 16px 64px;
  }

  header {
    text-align: center;
    margin-bottom: 24px;
  }
  header h1 {
    font-size: 1.5rem;
    color: #19e0ff;
    text-shadow: 0 0 12px #19e0ff88;
    letter-spacing: 0.05em;
  }
  header .timestamp {
    font-size: 0.8rem;
    color: #555570;
    margin-top: 6px;
  }

  .topic-bar {
    max-width: 760px;
    margin: 0 auto 32px;
    background: #0f0f1a;
    border: 1px solid #19e0ff44;
    border-radius: 8px;
    padding: 12px 18px;
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .topic-score {
    font-size: 0.75rem;
    color: #19e0ff;
    border: 1px solid #19e0ff55;
    border-radius: 99px;
    padding: 2px 10px;
    white-space: nowrap;
  }
  .topic-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #e8e8f0;
  }
  .topic-reason {
    font-size: 0.78rem;
    color: #7777aa;
  }

  .container {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  /* ── カード ── */
  .card {
    border: 1px solid #19e0ff44;
    border-radius: 12px;
    padding: 28px 28px 20px;
    box-shadow: 0 0 18px #19e0ff18, 0 4px 24px #00000080;
    background: #0f0f1a;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .media-label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #19e0ff;
    border: 1px solid #19e0ff66;
    border-radius: 4px;
    padding: 2px 8px;
  }

  .badge {
    font-size: 0.72rem;
    font-weight: 700;
    border-radius: 99px;
    padding: 2px 10px;
  }
  .badge.pass { background: #0d3d1f; color: #4dff91; border: 1px solid #4dff9155; }
  .badge.ng   { background: #3d0d0d; color: #ff5555; border: 1px solid #ff555555; }

  .issues-hint {
    font-size: 0.7rem;
    color: #ff8888;
    flex: 1 1 100%;
    margin-top: 4px;
  }

  /* ── 楽天ROOM ── */
  .product-img {
    width: 100%;
    max-width: 280px;
    height: auto;
    border-radius: 8px;
    display: block;
    margin-bottom: 12px;
    border: 1px solid #19e0ff22;
  }
  .product-meta { margin-bottom: 16px; }
  .product-name { font-size: 0.9rem; font-weight: 600; margin-bottom: 6px; }
  .product-price { font-size: 1rem; color: #19e0ff; font-weight: 700; }
  .review { font-size: 0.78rem; color: #aaaacc; font-weight: 400; margin-left: 8px; }
  .affiliate-link {
    display: inline-block;
    margin-top: 8px;
    font-size: 0.82rem;
    color: #19e0ff;
    text-decoration: none;
    border-bottom: 1px dashed #19e0ff55;
  }
  .affiliate-link:hover { border-bottom-color: #19e0ff; }
  .room-text {
    white-space: pre-wrap;
    font-size: 0.92rem;
    color: #d0d0e0;
    background: #15151f;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 14px;
    border-left: 3px solid #19e0ff44;
  }

  /* ── note / Medium ── */
  .topic-label {
    font-size: 0.75rem;
    color: #7777aa;
    margin-bottom: 8px;
  }
  .article-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #e8e8f0;
    margin-bottom: 10px;
    line-height: 1.4;
  }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
  .tag {
    font-size: 0.7rem;
    color: #19e0ff;
    border: 1px solid #19e0ff44;
    border-radius: 99px;
    padding: 2px 10px;
    background: #19e0ff0d;
  }
  .article-body {
    font-size: 0.88rem;
    color: #c8c8d8;
    line-height: 1.85;
  }
  .article-body h1, .article-body h2, .article-body h3 {
    color: #19e0ff;
    margin: 20px 0 8px;
    font-size: 1rem;
    letter-spacing: 0.03em;
  }
  .article-body strong { color: #e8e8f0; }
  .article-body em { color: #aaaacc; font-style: italic; }

  /* ── コピーボタン ── */
  .copy-btn {
    margin-top: 16px;
    background: transparent;
    border: 1px solid #19e0ff55;
    color: #19e0ff;
    border-radius: 6px;
    padding: 6px 18px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
  }
  .copy-btn:hover {
    background: #19e0ff18;
    box-shadow: 0 0 8px #19e0ff44;
  }
  .copy-btn.copied {
    color: #4dff91;
    border-color: #4dff9155;
  }

  @media (max-width: 520px) {
    .card { padding: 20px 16px 16px; }
    .article-title { font-size: 1.05rem; }
  }
</style>
</head>
<body>
<header>
  <h1>⚡ Content Preview</h1>
  <div class="timestamp">生成日時：${esc(now)}</div>
</header>

${topicBlock}

<div class="container">
  ${cards}
</div>

<script>
function copyText(btn, text) {
  const decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  navigator.clipboard.writeText(decoded).then(() => {
    btn.textContent = 'コピーしました ✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'コピー';
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    btn.textContent = 'コピー失敗';
  });
}
</script>
</body>
</html>`;
}

module.exports = { renderPreview };

// ─────────────────────────────────────────
// 単体テスト：node lib/render-preview.js
// ─────────────────────────────────────────
if (require.main === module) {
  const dummy = {
    topic: { title: 'テスト見出し', channelTitle: 'TestCh', jp_score: 80, reason: 'テスト理由' },
    room: { product:{ name:'テスト商品', price:1980, image:'https://via.placeholder.com/120', reviewAverage:4.5, reviewCount:12, affiliateUrl:'https://example.com' }, room_text:'これは紹介文です。\n二行目。', result:'pass', issues:[] },
    note: { topic:'AI活用', title:'noteタイトル', body:'## 見出し\n**太字**とふつうの文。', tags:['AI','効率化'], result:'pass', issues:[] },
    medium: { topic:'Japanese', title:'Medium Title', body:'## Heading\n**bold** and text.', tags:['japan','language'], result:'ng', issues:['too short'] }
  };
  const fs = require('fs');
  const html = renderPreview(dummy);
  fs.writeFileSync('preview-test.html', html, 'utf8');
  console.log('テストHTML書き出しOK → preview-test.html（ブラウザで開いて見た目を確認）');
}
