// app/api/kanji/route.js
// Kanji Deep Dive: 漢字・単語をClaudeに解説させるAPIルート
//
// ★ Tool Use（強制JSON）方式のサンプル実装
//   既存の lib/gen-room.js や lib/score.js は「自由テキストで出させて正規表現でJSON抽出」
//   という方式で、note生成の失敗（JSON解析失敗）の原因の一つと疑われている。
//   このルートでは代わりに Anthropic の Tool Use を使い、tool_choice でツール呼び出しを
//   強制することで、モデルの出力を必ず input_schema 通りの構造化データにしている。
//   → 正規表現で抜き出す処理が不要になり、パース失敗が原理的に起きない。
//   → lib/gen-note.js 等に同じ方式を横展開する際は、この KANJI_TOOL の定義と
//     tool_choice の渡し方をそのまま参考にできる。
//
// ※ 環境変数の「値」は絶対に画面・ログ・レスポンスに出さない

export const maxDuration = 30;

// Claude に強制させるJSONの形（Tool Useのinput_schema）
const KANJI_TOOL = {
  name: "kanji_breakdown",
  description:
    "Return a structured breakdown of a Japanese kanji character or word. If the input is not a valid Japanese kanji or word, set valid to false and explain in error_message instead of filling in the other fields.",
  input_schema: {
    type: "object",
    properties: {
      valid: {
        type: "boolean",
        description: "true if the input is a real Japanese kanji character or word",
      },
      error_message: {
        type: "string",
        description:
          "Only used when valid is false. A short, polite English message asking the user to enter a Japanese kanji or word.",
      },
      meaning: { type: "string", description: "English meaning, concise" },
      onyomi: {
        type: "string",
        description: "On'yomi readings, Japanese + romaji, comma separated (empty string if none)",
      },
      kunyomi: {
        type: "string",
        description: "Kun'yomi readings, Japanese + romaji, comma separated (empty string if none)",
      },
      origin: {
        type: "string",
        description:
          "Brief note on the character/word origin (字源). If uncertain or debated among scholars, say so explicitly (e.g. 'This origin is debated.') instead of asserting a single theory as fact.",
      },
      radical: { type: "string", description: "Radical (部首), Japanese + romaji + English name" },
      stroke_count: { type: "integer", description: "Total stroke count" },
      examples: {
        type: "array",
        description: "Exactly 2 example sentences that use the input correctly",
        items: {
          type: "object",
          properties: {
            japanese: { type: "string" },
            romaji: { type: "string" },
            english: { type: "string" },
          },
          required: ["japanese", "romaji", "english"],
        },
      },
      similar: {
        type: "array",
        description: "1-2 similar kanji/words and how they differ from the input",
        items: {
          type: "object",
          properties: {
            item: { type: "string", description: "Japanese, with romaji in parentheses" },
            difference: { type: "string", description: "English explanation of the difference" },
          },
          required: ["item", "difference"],
        },
      },
    },
    required: ["valid"],
  },
};

function buildPrompt(input) {
  return `You are a careful Japanese language reference tool for learners outside Japan.

Look at this input: "${input}"

Decide whether it is a real Japanese kanji character or word.
- If it is NOT a valid Japanese kanji/word (e.g. random text, English, gibberish), call the tool with valid:false and a short polite error_message asking for a Japanese kanji or word.
- If it IS valid, call the tool with valid:true and fill in every other field.

Accuracy rules (follow strictly):
- Never invent or guess at etymology/origin. If the 字源 is not well established or is debated among scholars, say so explicitly (e.g. "This origin is debated.") rather than stating one theory as fact.
- Never invent example sentences that use the word incorrectly, and never invent readings that don't exist.
- All Japanese text must be paired with romaji.
- Output must be in English, with Japanese + romaji only where Japanese text is shown.

Always respond by calling the kanji_breakdown tool exactly once. Do not respond with plain text.`;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = typeof body?.input === "string" ? body.input.trim() : "";

  // 簡易バリデーション：明らかに空／長すぎる入力はClaudeを呼ぶ前に弾く（コスト対策）
  if (!input) {
    return Response.json({ error: "Please enter a kanji or word." }, { status: 400 });
  }
  if (input.length > 20) {
    return Response.json(
      { error: "Please enter a single kanji character or a short word." },
      { status: 400 }
    );
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // 関数内で読む（他のlibと同じパターン）

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        tools: [KANJI_TOOL],
        tool_choice: { type: "tool", name: "kanji_breakdown" }, // 必ずこのツールを呼ばせる＝JSONパース失敗が起きない
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
    });

    if (!res.ok) {
      // エラー詳細（キーは含まれない）はサーバーログにだけ出す。レスポンスには出さない。
      const errBody = await res.text();
      console.error("kanji route: Claude API error", res.status, errBody);
      return Response.json(
        { error: "Something went wrong while looking that up. Please try again." },
        { status: 502 }
      );
    }

    const data = await res.json();
    const toolUse = data.content?.find((block) => block.type === "tool_use");

    if (!toolUse) {
      console.error("kanji route: no tool_use block in response");
      return Response.json(
        { error: "Something went wrong while looking that up. Please try again." },
        { status: 502 }
      );
    }

    // toolUse.input はスキーマに沿ったオブジェクト。正規表現でのJSON抽出は不要。
    return Response.json(toolUse.input);
  } catch (err) {
    console.error("kanji route: unexpected error", err.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
