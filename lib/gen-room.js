// 楽天ROOM用「貼るだけパッケージ」を生成するファイル
// ※ 環境変数の「値」は絶対に console.log に出さない

const https = require("https");

// dotenv を最初に実行（node で直接動かすとき用）
if (require.main === module) {
  require("dotenv").config({ path: ".env.local" });
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID;         // UUID形式
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY; // pk_... 形式
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;

// ─────────────────────────────────────────
// STEP 1: Claude にキーワードとアングルを生成させる
// ─────────────────────────────────────────
async function generateKeyword(topic) {
  const prompt = `
あなたは楽天ROOMのアフィリエイターです。
以下のトレンドトピックに関連する楽天市場の商品を紹介するための
検索キーワードと紹介アングルを考えてください。

トピック: ${topic.title}
日本市場向けスコア: ${topic.jp_score}/100
理由: ${topic.reason}

以下のJSON形式のみで回答してください（説明文不要）:
{
  "keyword": "楽天市場の検索キーワード（日本語・15文字以内）",
  "angle": "商品紹介のアングル（日本語・30文字以内）"
}
`.trim();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Claude API error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  const text = data.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude のレスポンスから JSON を抽出できませんでした");
  return JSON.parse(jsonMatch[0]);
}

// ─────────────────────────────────────────
// STEP 2: 楽天市場 商品検索 API（新エンドポイント 2026-04-01）
// ─────────────────────────────────────────
function searchRakuten(keyword) {
  const params = new URLSearchParams({
    applicationId: RAKUTEN_APP_ID,
    keyword: keyword,
    hits: "5",
    sort: "-reviewCount",
    imageFlag: "1",
    affiliateId: RAKUTEN_AFFILIATE_ID,
    formatVersion: "2",
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "openapi.rakuten.co.jp",
      path: `/ichibams/api/IchibaItem/Search/20260401?${params}`,
      method: "GET",
      headers: {
        accessKey: RAKUTEN_ACCESS_KEY,
        Referer: "https://my-nextjs-app-chi-woad.vercel.app/",
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`楽天 API エラー ${res.statusCode}: ${body}`));
        }
        let data;
        try { data = JSON.parse(body); } catch (e) {
          return reject(new Error(`JSON parse error: ${body}`));
        }
        if (data.error) {
          return reject(new Error(`楽天 API エラー: ${data.error} - ${data.error_description}`));
        }
        if (!data.Items || data.Items.length === 0) {
          return reject(new Error(`「${keyword}」の検索結果が0件でした`));
        }
        const item = data.Items[0];
        resolve({
          name: item.itemName,
          price: item.itemPrice,
          image: item.mediumImageUrls?.[0]?.imageUrl ?? "",
          affiliateUrl: item.affiliateUrl || item.itemUrl,
          shop: item.shopName,
          reviewCount: item.reviewCount,
          reviewAverage: item.reviewAverage,
        });
      });
    });

    req.on("error", (e) => reject(new Error(`リクエストエラー: ${e.message}`)));
    req.end();
  });
}

// ─────────────────────────────────────────
// STEP 3: Claude に楽天ROOM用の紹介文を生成させる
// ─────────────────────────────────────────
async function generateRoomText(topic, angle, product) {
  const prompt = `
あなたは楽天ROOMで商品を紹介するインフルエンサーです。
以下の情報をもとに、楽天ROOMに投稿する商品紹介文を作成してください。

【トレンドトピック】${topic.title}
【紹介アングル】${angle}
【商品名】${product.name}
【価格】¥${product.price.toLocaleString()}
【ショップ】${product.shop}
【レビュー】★${product.reviewAverage}（${product.reviewCount}件）

条件:
- 150〜250文字
- 絵文字を2〜3個使う
- トレンドとの関連性を自然に入れる
- 購買意欲を高めるが押しつけがましくない
- URLや商品コードは含めない
- 紹介文のみ出力（前置き・説明文不要）
`.trim();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Claude API error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return data.content[0].text.trim();
}

// ─────────────────────────────────────────
// メイン関数（外部から呼び出す）
// ─────────────────────────────────────────
async function genRoom(topic) {
  console.log("STEP 1: Claude にキーワードを生成中...");
  const { keyword, angle } = await generateKeyword(topic);
  console.log(`  keyword: ${keyword}`);
  console.log(`  angle: ${angle}`);

  console.log("STEP 2: 楽天市場を検索中...");
  const product = await searchRakuten(keyword);
  console.log(`  商品: ${product.name}`);
  console.log(`  価格: ¥${product.price}`);

  console.log("STEP 3: Claude に紹介文を生成中...");
  const room_text = await generateRoomText(topic, angle, product);
  console.log(`  紹介文: ${room_text}`);

  return { keyword, angle, product, room_text };
}

module.exports = { genRoom };

// ─────────────────────────────────────────
// ローカルテスト用
// ─────────────────────────────────────────
if (require.main === module) {
  const testTopic = {
    title: "VALORANT",
    jp_score: 85,
    reason: "eスポーツへの関心が高く、日本でも人気のゲームタイトル",
  };

  genRoom(testTopic)
    .then((result) => {
      console.log("\n===== 完成した楽天ROOMパッケージ =====");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error("エラー:", err.message);
      process.exit(1);
    });
}
