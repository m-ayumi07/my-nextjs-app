// lib/run-morning.js
// 役割：毎朝の流れを1本に。trends→score→3媒体生成→refine→結果をLINEに要約通知
// テスト：node lib/run-morning.js で直接動く

const { genRoom }   = require('./gen-room');
const { genNote }   = require('./gen-note');
const { genMedium } = require('./gen-medium');
const { refine }    = require('./refine');
const { pushLine }  = require('./line');
const { saveDaily } = require('./store');          // 保存用（Vercel Blob）

// ─────────────────────────────────────────
// trends.js / score.js は ES モジュール（export 構文）のため require() 不可。
// preview.js と同じパターンで、ここにインライン実装する。
// ─────────────────────────────────────────
async function fetchTopStory() {
  const API_KEY           = process.env.YOUTUBE_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  async function fetchTrending(regionCode) {
    const url =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=snippet&chart=mostPopular&regionCode=${regionCode}&maxResults=20&key=${API_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();
    return (data.items || []).map((item) => ({
      title:        item.snippet.title,
      channelTitle: item.snippet.channelTitle,
    }));
  }

  const [us, jp] = await Promise.all([
    fetchTrending('US').catch(() => []),
    fetchTrending('JP').catch(() => []),
  ]);

  const jpTitles = jp.map((v) => v.title).join('\n');
  const usTitles = us.map((v) => `${v.title} / ${v.channelTitle}`).join('\n');

  const prompt = `あなたはYouTubeトレンド分析の専門家です。
以下のアメリカの急上昇動画リストを見て、各動画に「日本上陸スコア」を付けてください。

【日本の急上昇動画（参考）】
${jpTitles}

【アメリカの急上昇動画】
${usTitles}

各動画について以下の形式で評価してください。
- jp_score: 0〜100の数字（日本でも流行る可能性）
- reason: 40字以内の理由

JSONのみで出力。前置きや説明文は書かない。

出力形式：
[
  { "title": "動画タイトル", "channelTitle": "チャンネル名", "jp_score": 85, "reason": "理由" }
]`;

  const res  = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data      = await res.json();
  const text      = data.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const scored    = JSON.parse(jsonMatch[0]);

  // jp_score が最も高い1件を返す
  return scored.reduce((best, item) =>
    item.jp_score > best.jp_score ? item : best
  );
}

// ─────────────────────────────────────────
// メイン関数
//   戻り値: { topic, results }
// ─────────────────────────────────────────
async function runMorning() {
  // 1) トレンド取得 → スコアリング → 今日のネタ1件
  console.log('【0/3】今日のネタを取得中（YouTube trends → score）...');
  const topic = await fetchTopStory();
  console.log(`      今日のネタ: 「${topic.title}」`);
  console.log(`      jp_score : ${topic.jp_score} / 理由: ${topic.reason}`);

  // 2) 3媒体を生成 → 3) refine（1本失敗しても他を止めない）
  const jobs = [
    {
      label: '① 楽天ROOM',
      run: async () => {
        // genRoom は topic を受け取り { keyword, angle, product, room_text } を返す
        const r = await genRoom(topic);
        // refine が必要とする形式に変換（room は title なし、body = room_text）
        // _extra に product を退避：refine の return は明示キーだけなので消えてしまうため
        return { kind: 'room', title: '', body: r.room_text, tags: [],
                 _extra: { product: r.product } };
      },
    },
    {
      label: '② note',
      run: async () => {
        // genNote は topic を受け取らない（テーマを自分で選ぶ）
        const r = await genNote();
        // articleTopic に分野名を退避（refine で消えるため）
        return { kind: 'note', title: r.title, body: r.body, tags: r.tags,
                 _extra: { articleTopic: r.topic } };
      },
    },
    {
      label: '③ Medium',
      run: async () => {
        // genMedium は topic を受け取らない（テーマを自分で選ぶ）
        const r = await genMedium();
        // articleTopic に分野名を退避（refine で消えるため）
        return { kind: 'medium', title: r.title, body: r.body, tags: r.tags,
                 _extra: { articleTopic: r.topic } };
      },
    },
  ];

  const results = [];
  for (const [i, job] of jobs.entries()) {
    console.log(`\n【${i + 1}/3】${job.label} を生成中...`);
    try {
      const article = await job.run();
      const extra   = article._extra ?? {};          // refine前に退避（refineのreturnで消えるため）
      console.log(`      → refine（チェック＆修正）中...`);
      // refine の戻り値: { kind, title, body, tags, result, issues, fix_hint, tries }
      const refined = await refine(article);
      results.push({ label: job.label, ok: refined.result === 'pass',
                     data: { ...refined, ...extra } }); // refine後にextraを復元してマージ
    } catch (e) {
      results.push({ label: job.label, ok: false, error: e.message });
    }
  }

  // 4) LINEメッセージに整形
  const now = new Date().toLocaleString('ja-JP');
  let msg = `☀️ 今日の自動収益エンジン ${now}\n\n`;
  msg += `【今日のネタ】${topic.title}（score: ${topic.jp_score}）\n\n`;

  for (const r of results) {
    if (r.error) {
      msg += `${r.label}：[エラー] ${r.error}\n`;
      continue;
    }
    const mark         = r.ok ? '合格' : '要確認';
    const displayTitle = r.data.title || '（楽天ROOM紹介文）';
    msg += `${r.label}：[${mark}] ${displayTitle}\n`;
    // 要確認のとき：issues の1件目を理由として添える
    if (!r.ok && r.data.issues?.length > 0) {
      msg += `　└ ${r.data.issues[0]}\n`;
    }
  }

  // プレビューURL（SITE_URL が無ければ何も足さない＝通知は止めない）
  const base = process.env.SITE_URL;
  const previewLine = base
    ? `\n▼確認はこちら\n${base}/preview?key=${process.env.PREVIEW_KEY}`
    : '';
  if (base) {
    const key = process.env.PREVIEW_KEY || '';
    console.log(`      previewUrl: ${base}/preview?key=****${key.slice(-4)}`);
  }
  msg += previewLine;

  // 5) 保存（失敗してもLINE通知は止めない）
  try {
    await saveDaily(buildDaily({ topic, results }));
    console.log('\n✅ Blob保存完了');
  } catch (e) {
    console.warn('\n⚠️  Blob保存スキップ:', e.message);
  }

  // 6) 送信
  await pushLine(msg);
  console.log('\n✅ LINE送信完了。スマホを確認してください。');

  // 6) 返す（api 側が使う）
  return { topic, results };
}

// ─────────────────────────────────────────
// buildDaily：results を render-preview.js が受け取れる形に詰め替える純粋関数
//   { topic, room:{product,room_text,result,issues}, note:{topic,title,body,tags,...}, medium:{...} }
//   API を一切呼ばないので単体テストにも使える
// ─────────────────────────────────────────
function buildDaily({ topic, results }) {
  const find = (kind) => (results || []).find((r) => r.data?.kind === kind);

  const roomEntry   = find('room');
  const noteEntry   = find('note');
  const mediumEntry = find('medium');

  return {
    topic,
    room: roomEntry ? {
      product:   roomEntry.data.product   ?? null,
      room_text: roomEntry.data.body,               // refine後の紹介文
      result:    roomEntry.data.result    ?? 'pass',
      issues:    roomEntry.data.issues    ?? [],
    } : null,
    note: noteEntry ? {
      topic:  noteEntry.data.articleTopic ?? '',    // 退避しておいた分野名
      title:  noteEntry.data.title,
      body:   noteEntry.data.body,
      tags:   noteEntry.data.tags,
      result: noteEntry.data.result       ?? 'pass',
      issues: noteEntry.data.issues       ?? [],
    } : null,
    medium: mediumEntry ? {
      topic:  mediumEntry.data.articleTopic ?? '',  // 退避しておいた分野名
      title:  mediumEntry.data.title,
      body:   mediumEntry.data.body,
      tags:   mediumEntry.data.tags,
      result: mediumEntry.data.result       ?? 'pass',
      issues: mediumEntry.data.issues       ?? [],
    } : null,
  };
}

module.exports = { runMorning, buildDaily };

// ─────────────────────────────────────────
// テスト：node lib/run-morning.js
// LLM・LINE・Blob を一切呼ばず buildDaily + renderPreview だけ確認する
// ─────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' });
  const fs = require('fs');
  const { renderPreview } = require('./render-preview');

  const dummyTopic = { title: 'テスト動画タイトル', channelTitle: 'TestCh', jp_score: 92, reason: 'テスト理由' };
  const dummyResults = [
    {
      label: '① 楽天ROOM', ok: true,
      data: {
        kind: 'room', title: '', body: 'これはテスト紹介文です。商品の説明が入ります。',
        tags: [], result: 'pass', issues: [],
        product: { name: 'テスト商品名', price: 2980, image: 'https://via.placeholder.com/120',
                   reviewAverage: 4.3, reviewCount: 28, affiliateUrl: 'https://example.com' },
      },
    },
    {
      label: '② note', ok: true,
      data: {
        kind: 'note', title: 'noteテストタイトル',
        body: '## 見出し\n**太字**とふつうの文。\n\nここが本文です。',
        tags: ['AI', '仕事術'], result: 'pass', issues: [],
        articleTopic: 'AI活用',
      },
    },
    {
      label: '③ Medium', ok: false,
      data: {
        kind: 'medium', title: 'Medium Test Title',
        body: '## Heading\n**bold** and regular text.\n\nBody content here.',
        tags: ['Japan', 'Language'], result: 'ng', issues: ['too short'],
        articleTopic: 'Japanese Culture',
      },
    },
  ];

  const daily = buildDaily({ topic: dummyTopic, results: dummyResults });
  const html  = renderPreview(daily);
  fs.writeFileSync('preview-test2.html', html, 'utf8');
  console.log('✅ preview-test2.html 書き出しOK → ブラウザで開いて確認してください');
}
