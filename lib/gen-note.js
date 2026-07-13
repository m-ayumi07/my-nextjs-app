// note用「貼るだけ記事パッケージ」を生成するファイル
// テーマは Claude 自身が4分野の中から選ぶ。商品・お題は受け取らない。
// ※ 環境変数の「値」は絶対に console.log に出さない

// ─────────────────────────────────────────
// メイン関数
//   opts: { recentTitles: string[] }  ← 省略可（省略時は空配列）
//   戻り値: { topic, title, body, tags }
// ─────────────────────────────────────────
async function genNote(opts = {}) {
  // 関数内で読む（dotenvがいつ呼ばれても確実に値が取れる）
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const recentTitles = Array.isArray(opts.recentTitles) ? opts.recentTitles : [];

  // 直近タイトルがあれば「かぶり禁止」の指示を追加
  const recentBlock =
    recentTitles.length > 0
      ? `\n【直近の記事タイトル（内容がかぶらないようにする）】\n${recentTitles.map((t) => `- ${t}`).join("\n")}`
      : "";

  console.log("STEP 1: Claude にテーマ選択＋note記事を生成させています...");

  const prompt = `
あなたは日本語のコラムライターです。
以下の4つの分野の中から、今日書くテーマを1つ自分で選び、noteに投稿できる日本語の解説・コラム記事を1本書いてください。

【選べる分野（この4つの中だけから選ぶ）】
1. AI活用
2. これからの時代に必要なこと
3. プロンプト術
4. 便利な機能・ツールの使いこなし

【絶対に選ばないテーマ】
掃除・家電・ロボット掃除機・商品紹介・買い物・ガジェット紹介など「モノを紹介する」系は一切禁止。
${recentBlock}

【記事の条件】
- 読み手にとって役立つ・読みやすい解説/コラム調
- 本文は1200〜1800字目安
- 構成：短い導入 → 見出し付きで3つのポイント（## 見出し形式）→ まとめ
- 「プロンプト術」または「便利な機能・ツールの使いこなし」を選んだ場合は、コピペして使えるプロンプト例を最低1つ本文中に入れる
- 顔出し不可・匿名が絶対。「私は〇〇した」のような作り話の体験談・個人を特定する情報は入れない（一般論・情報として書く）
- 効果を断定する誇大表現は避ける
- タグは日本語で3〜5個（#は付けず言葉だけ。例：AI活用、仕事術、プロンプト）

【出力形式】
JSONのみ出力。前置き・説明・コードブロック記号（\`\`\`）は一切出力しない。

{
  "topic": "選んだ分野名（上の1〜4のいずれか）",
  "title": "記事タイトル",
  "body": "記事本文（マークダウン形式、1200〜1800字）",
  "tags": ["タグ1", "タグ2", "タグ3"]
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
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API エラー: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  const raw = data.content[0].text;

  // ```json ... ``` で囲まれていても安全に外す
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // { ... } の部分だけ抜き出す（前後に余分な文字がある場合の保険）
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `Claude の返答から JSON を抽出できませんでした。返答の先頭: ${raw.slice(0, 100)}`
    );
  }

  let article;
  try {
    article = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(
      `JSON.parse に失敗しました: ${e.message}\n抽出テキスト: ${jsonMatch[0].slice(0, 100)}`
    );
  }

  console.log(`  分野: ${article.topic}`);
  console.log(`  タイトル: ${article.title}`);
  console.log(`  タグ: ${(article.tags || []).join(" / ")}`);
  console.log(`  本文文字数: 約 ${article.body?.length ?? 0} 字`);

  return article; // { topic, title, body, tags }
}

module.exports = { genNote };

// ─────────────────────────────────────────
// ローカルテスト用（node lib/gen-note.js で実行したときだけ動く）
// ─────────────────────────────────────────
if (require.main === module) {
  require("dotenv").config({ path: ".env.local" });

  genNote()
    .then((result) => {
      console.log("\n===== 完成した note 記事パッケージ =====");
      console.log("【分野】 ", result.topic);
      console.log("【タイトル】", result.title);
      console.log("【タグ】", result.tags.join(" / "));
      console.log("\n【本文（最初の200字）】");
      console.log(result.body.slice(0, 200) + "...");
      console.log(`\n（本文全体: ${result.body.length} 字）`);
    })
    .catch((err) => {
      console.error("エラー:", err.message);
      process.exit(1);
    });
}
