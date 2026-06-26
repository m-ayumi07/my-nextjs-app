// Claude API を使って US トレンドに日本上陸スコアを付けるファイル

import { getTrends } from "./trends";

export async function getTopStory() {
  // 1. US と JP 両方のトレンドを取得する
  const { us, jp } = await getTrends();

  // 2. Claude に渡す情報を文字列に整形する
  //    JP のタイトル一覧（「もう来ている」か判断するための参考情報）
  const jpTitles = jp.map((v) => v.title).join("\n");

  //    US のタイトル一覧（スコアを付ける対象）
  const usTitles = us.map((v) => `${v.title} / ${v.channelTitle}`).join("\n");

  // 3. Claude へのプロンプト（指示文）を組み立てる
  const prompt = `あなたはYouTubeトレンド分析の専門家です。
以下のアメリカの急上昇動画リストを見て、各動画に「日本上陸スコア」を付けてください。

【日本の急上昇動画（参考）】
${jpTitles}

【アメリカの急上昇動画】
${usTitles}

各動画について以下の形式で評価してください。
- jp_score: 0〜100の数字（日本でも流行る可能性）
- reason: 40字以内の理由。すでに日本側に似た話題があれば「もう来ている」、なければ「タイムラグ先行のチャンス」として評価

JSONのみで出力。前置きや説明文は書かない。

出力形式：
[
  { "title": "動画タイトル", "channelTitle": "チャンネル名", "jp_score": 85, "reason": "理由" }
]`;

  // 4. Claude API（Anthropic）を直接呼び出す
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,   // 環境変数からAPIキーを読む
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",  // 高速・低コストのモデルを使用
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  // 5. Claude の返答テキストを取り出す
  const data = await response.json();
  const text = data.content[0].text;

  // 6. テキストを JSON に変換する
  //    Claude が余分な文字を付けた場合も対応できるよう、[]の中身だけ抜き出す
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const scored = JSON.parse(jsonMatch[0]);

  // 7. jp_score が一番高い1件を「今日のネタ」として返す
  const top = scored.reduce((best, item) =>
    item.jp_score > best.jp_score ? item : best
  );

  return top;
}
