// lib/gen-room.js
// 楽天ROOM用「貼るだけパッケージ」を生成するファイル

// ── Claude API を呼ぶ共通ヘルパー ─────────────────────────────────────
async function callClaude(prompt) {
  // Anthropic の API サーバーにリクエストを送る
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,   // 環境変数からキーを読む
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();

  // 正常な返答が来ているか確認（キーが空のときはエラー文言を出す）
  if (!data.content?.[0]?.text) {
    throw new Error("Claude API の返答が不正です: " + JSON.stringify(data));
  }

  return data.content[0].text;
}

// ── Claude の返答から安全に JSON を取り出す ───────────────────────────
function parseClaudeJson(text) {
  // Claude が ``` や ```json で囲んで返してきても除去する
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      "JSON のパースに失敗しました。\nClaude の返答:\n" + cleaned
    );
  }
}

// ── メインの関数 ──────────────────────────────────────────────────────
async function genRoom(topic) {
  // topic が文字列でも動くように title を取り出す
  const topicTitle = topic?.title ?? String(topic);

  // ━━ STEP 1: キーワード生成（Claude） ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 海外トレンドを「楽天市場で商品が当たりやすい日本語キーワード」に変換する
  console.log("🔍 STEP 1: 楽天検索キーワードを Claude に生成してもらいます...");

  const keywordPrompt = `あなたは楽天市場の商品検索の専門家です。
以下の海外トレンドトピックをもとに、日本の楽天市場で実際に売っている商品に当たりやすい日本語の検索キーワードを1つ考えてください。

トピック：${topicTitle}

条件：
- 楽天市場で検索したときに商品がヒットする具体的な商品名・カテゴリ名にする
- 一般的すぎず絞りすぎない（例：「掃除ロボット」「ゲーミングチェア」など）
- トレンドと関連しつつ、日本人が実際に買いたくなるものを選ぶ

JSONのみで出力。前置き・説明・\`\`\`は一切出力しない。
{"keyword": "検索キーワード", "angle": "紹介の切り口を一言"}`;

  const keywordText = await callClaude(keywordPrompt);
  const { keyword, angle } = parseClaudeJson(keywordText);
  console.log(`   → キーワード: "${keyword}"、切り口: "${angle}"`);

  // ━━ STEP 2: 楽天商品検索 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 楽天 API で商品を検索し、レビューが多くて評価が高い1件を選ぶ
  console.log("🛒 STEP 2: 楽天 API で商品を検索します...");

  // 楽天 API を呼ぶ内部関数（キーワードを変えて再検索にも使う）
  async function searchRakuten(kw) {
    const params = new URLSearchParams({
      applicationId: process.env.RAKUTEN_APP_ID,
      affiliateId:   process.env.RAKUTEN_AFFILIATE_ID,
      keyword:       kw,
      hits:          "10",
      imageFlag:     "1",
      sort:          "-reviewCount",   // レビュー件数の多い順
    });
    const url =
      "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?" +
      params.toString();

    const res  = await fetch(url);
    const data = await res.json();
    return data.Items ?? [];
  }

  // まず通常キーワードで検索
  let items = await searchRakuten(keyword);

  // 0件なら最初の単語だけに絞って再検索（1回だけ）
  if (items.length === 0) {
    const shortKeyword = keyword.split(/[\s　]/)[0];
    console.log(
      `   → 0件でした。"${shortKeyword}" に絞って再検索します...`
    );
    items = await searchRakuten(shortKeyword);
  }

  if (items.length === 0) {
    throw new Error(
      `楽天で商品が見つかりませんでした（キーワード: ${keyword}）`
    );
  }

  // 画像ありの商品に絞り、レビュー件数×平均でスコアを計算して1件選ぶ
  const best = items
    .map((i) => i.Item)
    .filter((i) => i.mediumImageUrls?.length > 0)
    .sort(
      (a, b) =>
        b.reviewCount * b.reviewAverage - a.reviewCount * a.reviewAverage
    )[0];

  if (!best) throw new Error("画像付きの商品が見つかりませんでした");

  const product = {
    name:          best.itemName,
    price:         best.itemPrice,
    image:         best.mediumImageUrls[0]?.imageUrl ?? "",
    affiliateUrl:  best.affiliateUrl,   // affiliateId を渡していれば自動で入る
    shop:          best.shopName,
    reviewCount:   best.reviewCount,
    reviewAverage: best.reviewAverage,
  };
  console.log(
    `   → 商品: "${product.name.slice(0, 40)}..." ¥${product.price}`
  );

  // ━━ STEP 3: 紹介文生成（Claude） ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 選んだ商品の情報を Claude に渡し、楽天 ROOM 用の口コミ調紹介文を作る
  console.log("✍️  STEP 3: 楽天 ROOM 用の紹介文を Claude に書いてもらいます...");

  const textPrompt = `あなたは楽天 ROOM で活躍するインフルエンサーです。
以下の商品について、楽天 ROOM に投稿する自然な口コミ調の紹介文を書いてください。

商品名：${product.name}
価格：¥${product.price}
紹介の切り口：${angle}

条件：
- 150〜250字目安
- 絵文字は控えめ（1〜2個程度）
- 自然な口コミ調で書く
- 効果を断定する表現・薬機法・景品表示法に触れる表現は避ける
- 実体験のねつ造・個人を特定する情報は入れない

JSONのみで出力。前置き・説明・\`\`\`は一切出力しない。
{"room_text": "紹介文をここに"}`;

  const textResult = await callClaude(textPrompt);
  const { room_text } = parseClaudeJson(textResult);
  console.log(`   → 紹介文（先頭50字）: "${room_text.slice(0, 50)}..."`);

  // ━━ STEP 4: パッケージを返す ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return { keyword, angle, product, room_text };
}

module.exports = { genRoom };

// ── テスト用：node lib/gen-room.js で直接実行したときだけ動く ────────
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' }); // .env.local を読み込む
  const testTopic = {
    title: "便利な掃除ガジェット",
    jp_score: 80,
    reason: "テスト用",
  };

  console.log("=== gen-room.js テスト実行 ===");
  console.log("トピック:", testTopic.title);
  console.log("");

  genRoom(testTopic)
    .then((result) => {
      console.log("\n=== 結果 ===");
      console.log("キーワード    :", result.keyword);
      console.log("切り口        :", result.angle);
      console.log("商品名        :", result.product.name.slice(0, 60));
      console.log("価格          :", `¥${result.product.price}`);
      console.log("ショップ      :", result.product.shop);
      console.log(
        "レビュー      :",
        `${result.product.reviewAverage}点 (${result.product.reviewCount}件)`
      );
      console.log(
        "アフィリURL   :",
        result.product.affiliateUrl ? "✅ 取得済み" : "❌ なし"
      );
      console.log("紹介文        :\n" + result.room_text);
    })
    .catch((err) => {
      console.error("❌ エラー:", err.message);
    });
}
