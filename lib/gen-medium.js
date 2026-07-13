// Medium用「貼るだけ記事パッケージ」を生成するファイル
// 読者：日本語を学びたい人・日本を知りたい外国人
// テーマは Claude 自身が「日本語の言葉・漢字・文化」の範囲から選ぶ。
// ※ 環境変数の「値」は絶対に console.log に出さない

// ─────────────────────────────────────────
// メイン関数
//   opts: { recentTitles: string[] }  ← 省略可（省略時は空配列）
//   戻り値: { topic, title, body, tags }
// ─────────────────────────────────────────
async function genMedium(opts = {}) {
  // 関数内で読む（dotenvがいつ呼ばれても確実に値が取れる）
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const recentTitles = Array.isArray(opts.recentTitles) ? opts.recentTitles : [];

  // 直近タイトルがあれば「かぶり禁止」の指示を追加
  const recentBlock =
    recentTitles.length > 0
      ? `\nRecent article titles — do NOT overlap with these:\n${recentTitles.map((t) => `- ${t}`).join("\n")}`
      : "";

  console.log("STEP 1: Asking Claude to pick a topic and write a Medium article...");

  const prompt = `
You are an English-language writer for Medium. Your readers are people who want to learn Japanese or learn about Japan. Do the following two things in one go.

## STEP 1 — Pick a topic
Choose ONE topic from these areas:
- A Japanese word, expression, or proverb worth knowing
- A kanji character and its meaning / components
- A Japanese cultural or historical concept that helps readers understand Japan

Preferred format: "deep-dive into one word / one kanji / one concept" — go narrow and deep rather than broad.

Rules:
- Accuracy is the top priority. Only write what is well-established and widely confirmed. If the etymology or history of a word is uncertain, do NOT include it — skip it or clearly note uncertainty.
- Do NOT fabricate or guess at historical origins.
${recentBlock}

## STEP 2 — Write the article
Write a complete Medium article in English on the topic you chose. Conditions:
- Natural English, learner-friendly explainer tone.
- When covering a word, expression, or kanji, always show: Japanese script + romaji + English meaning as a set.
  Example format: 木漏れ日 (*komorebi*) — "sunlight filtering through leaves"
- Include at least one example sentence in the format:
  Japanese: ＜sentence＞
  Romaji: ＜romanized sentence＞
  English: ＜translation＞
- Length: 700–1000 words.
- Structure: short intro → 3 sections with ## headings (e.g., What It Means / How It's Used / Cultural Background) → conclusion.
- No first-person fabricated anecdotes ("When I lived in Japan, I..."). Write as general cultural explanation.
- Avoid exaggerated claims or over-promising ("This word will transform how you see the world").
- Tags: 3–5 English words/phrases, no # symbol (e.g., Japanese, LearnJapanese, JapaneseLanguage, Japan, Kanji).

## Output format
Output JSON only. No preamble, no explanation, no code fences (\`\`\`).

{
  "topic": "One-line description of the chosen word / kanji / concept",
  "title": "Article title",
  "body": "Full article body in Markdown (700–1000 words)",
  "tags": ["Tag1", "Tag2", "Tag3"]
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
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  const raw = data.content[0].text;

  // ```json ... ``` で囲まれていても安全に外す
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // { ... } の部分だけ抜き出す（前後に余分な文字がある場合の保険）
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `Could not extract JSON from Claude's response. Response start: ${raw.slice(0, 100)}`
    );
  }

  let article;
  try {
    article = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(
      `JSON.parse failed: ${e.message}\nExtracted text: ${jsonMatch[0].slice(0, 100)}`
    );
  }

  console.log(`  Topic : ${article.topic}`);
  console.log(`  Title : ${article.title}`);
  console.log(`  Tags  : ${(article.tags || []).join(" / ")}`);
  console.log(`  Words : ~${article.body?.split(/\s+/).length ?? 0} words`);

  return article; // { topic, title, body, tags }
}

module.exports = { genMedium };

// ─────────────────────────────────────────
// ローカルテスト用（node lib/gen-medium.js で実行したときだけ動く）
// ─────────────────────────────────────────
if (require.main === module) {
  require("dotenv").config({ path: ".env.local" });

  genMedium()
    .then((result) => {
      console.log("\n===== Medium Article Package =====");
      console.log("[ Topic ]", result.topic);
      console.log("[ Title ]", result.title);
      console.log("[ Tags  ]", result.tags.join(" / "));
      console.log("\n[ Body — first 400 chars ]");
      console.log(result.body.slice(0, 400) + "...");
      console.log(`\n(Full body: ~${result.body.split(/\s+/).length} words)`);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}
