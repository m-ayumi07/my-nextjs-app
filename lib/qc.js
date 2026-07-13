// 投稿前の品質チェック（最後の関所）
// gen-room / gen-note / gen-medium の出力を点検し、pass か ng を返す。
// ※ 環境変数の「値」は絶対に console.log に出さない

// ─────────────────────────────────────────
// 文字数チェック（コードで数える）
//   kind ごとの目安範囲を超えていたら issues に追加し、lengthNg フラグを返す。
// ─────────────────────────────────────────
function checkLength(kind, body) {
  const issues = [];

  if (kind === "room") {
    // 日本語の文字数（スペース・改行を除いた文字数で概算）
    const len = body.replace(/\s/g, "").length;
    if (len < 120) {
      issues.push(`紹介文が短すぎます（${len}字）。目安は150〜250字です。`);
    } else if (len > 300) {
      issues.push(`紹介文が長すぎます（${len}字）。目安は150〜250字です。`);
    }
  } else if (kind === "note") {
    const len = body.replace(/\s/g, "").length;
    if (len < 1000) {
      issues.push(`本文が短すぎます（${len}字）。目安は1200〜1800字です。`);
    } else if (len > 2200) {
      issues.push(`本文が長すぎます（${len}字）。目安は1200〜1800字です。`);
    }
  } else if (kind === "medium") {
    // 英語はワード数で数える
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    if (words < 600) {
      issues.push(`Body is too short (~${words} words). Target is 700–1000 words.`);
    } else if (words > 1200) {
      issues.push(`Body is too long (~${words} words). Target is 700–1000 words.`);
    }
  }

  return { lengthNg: issues.length > 0, issues };
}

// ─────────────────────────────────────────
// メイン関数
//   input: { kind, title, body, tags }
//   戻り値: { result, issues, fix_hint }
// ─────────────────────────────────────────
async function qc(input) {
  // 関数内で読む（dotenvがいつ呼ばれても確実に値が取れる）
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const { kind, title = "", body = "", tags = [] } = input;

  // ── STEP 1: 文字数チェック（コードで即座に判定）──
  console.log("STEP 1: 文字数チェック中...");
  const { lengthNg, issues: lengthIssues } = checkLength(kind, body);
  if (lengthNg) {
    console.log(`  ⚠️  文字数NG: ${lengthIssues.join(" / ")}`);
  } else {
    console.log("  ✓ 文字数OK");
  }

  // ── STEP 2: 中身チェック（Claude Haiku に渡す）──
  console.log("STEP 2: Claude Haiku で中身をチェック中...");

  // kindごとに確認ポイントを日英で切り替え
  const isJapanese = kind === "room" || kind === "note";

  const contentForCheck = [
    title ? `【タイトル】${title}` : "",
    `【本文】${body}`,
    tags.length > 0 ? `【タグ】${tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = isJapanese
    ? `
あなたはWebコンテンツの品質チェック担当です。
以下のコンテンツ（kind: ${kind}）を読んで、次の4点を確認してください。

【確認項目】
1. 個人情報・身バレ：実名/住所/連絡先/場所が特定できる記述、または「私は実際に使って」のような"作り話の一人称体験談"（匿名運用に反する）が含まれていないか。
2. 著作権：他人の文章のコピー、歌詞や長い引用、丸写しの疑いがないか。
3. 誇大・法令（主にroomチェック）：効果を断定する誇張、薬機法・景品表示法に触れそうな言い回しがないか。
4. 事実の不確かさ（主にnote/mediumチェック）：語源・歴史など、間違っていそう／確認が必要な記述があれば指摘。
5. 憶測・作り話（room/note/medium 共通）：以下のいずれかが含まれていないか。
   - 「SNSで話題」「トレンドで注目」「口コミで人気」など、裏付けのない人気・流行の主張。
   - 商品の事実情報（商品名・価格・レビューなど）にない用途・シーン・効果のでっち上げ。
   - （note/medium）確認できない語源・歴史・統計データの断定（「〜と言われている」は軽微なのでOK、「〜だ」と断定する形はNG）。

問題がなければ result:"pass"。1つでも問題があれば result:"ng" とし、issues に具体的な箇所を列挙してください。
fix_hint には「事実・根拠のある範囲に書き換える」など、直し方を一言で示してください。

出力はJSONのみ。前置き・説明・コードブロック記号（\`\`\`）は一切出力しない。

{
  "result": "pass" または "ng",
  "issues": ["問題点1", "問題点2"],
  "fix_hint": "直し方を一言（passのときは空文字列）"
}

【チェック対象コンテンツ】
${contentForCheck}
`.trim()
    : `
You are a content quality reviewer.
Read the following content (kind: ${kind}) and check these 4 points:

1. Personal info / anonymity: Any real names, addresses, contact info, specific locations, or first-person fabricated anecdotes ("When I lived in Japan, I..." — these violate anonymous operation).
2. Copyright: Any copied text, song lyrics, long quotations, or suspiciously duplicated passages.
3. Exaggeration / misleading claims: Any absolute promises or unsubstantiated health/financial claims.
4. Factual accuracy: Any etymology, history, or cultural facts that seem incorrect or unverified — flag them.
5. Fabricated or speculative claims (applies to all kinds): Flag any of the following:
   - Unsubstantiated popularity claims: "trending on social media", "going viral", "everyone is talking about it", etc. with no evidence.
   - Invented use cases, scenes, or effects not supported by the product information provided (name, price, reviews).
   - (note/medium) Definitive assertions about etymology, history, or statistics that cannot be verified ("It is said that..." is acceptable; flat assertions stated as fact are not).

If no issues found: result "pass". If any issue found: result "ng" and list the specific problems in issues.
In fix_hint, suggest a one-line fix such as "Rewrite to stay within verifiable facts and stated product information."

Output JSON only. No preamble, no explanation, no code fences (\`\`\`).

{
  "result": "pass" or "ng",
  "issues": ["issue1", "issue2"],
  "fix_hint": "One-line fix suggestion (empty string if pass)"
}

[Content to review]
${contentForCheck}
`.trim();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
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

  let haikuResult;
  try {
    haikuResult = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(
      `JSON.parse に失敗しました: ${e.message}\n抽出テキスト: ${jsonMatch[0].slice(0, 100)}`
    );
  }

  console.log(`  Haiku 判定: ${haikuResult.result}`);
  if (haikuResult.issues?.length > 0) {
    haikuResult.issues.forEach((issue) => console.log(`  ⚠️  ${issue}`));
  }

  // ── STEP 3: 文字数チェックと Haiku 結果を合算 ──
  const allIssues = [...lengthIssues, ...(haikuResult.issues || [])];
  const finalResult = lengthNg || haikuResult.result === "ng" ? "ng" : "pass";
  const fixHint =
    finalResult === "ng"
      ? haikuResult.fix_hint || (lengthIssues.length > 0 ? "文字数を調整してください。" : "")
      : "";

  return {
    result: finalResult,
    issues: allIssues,
    fix_hint: fixHint,
  };
}

module.exports = { qc };

// ─────────────────────────────────────────
// ローカルテスト用（node lib/qc.js で実行したときだけ動く）
// ─────────────────────────────────────────
if (require.main === module) {
  require("dotenv").config({ path: ".env.local" });

  // ── テスト1：わざとダメな例（短すぎ＋作り話の体験談）→ ng になるはず ──
  const badInput = {
    kind: "note",
    title: "AIを使った仕事術",
    body: "私は実際に使ってみましたが、すごく良かったです。おすすめです。",
    tags: ["AI", "仕事術"],
  };

  // ── テスト1b：SNSでっち上げ入りの room → ng になるはず ──
  const fabricatedRoomInput = {
    kind: "room",
    body: "SNSで話題沸騰中！トレンドで注目されているゲーミングマウスです。プロゲーマーも絶賛する操作性で、エイム精度が劇的に向上すると口コミで大人気。¥3,980でこのクオリティはコスパ最強です！🔥🎮",
  };

  // ── テスト2：ちゃんとした本文 → pass になるはず ──
  const goodInput = {
    kind: "note",
    title: "AIプロンプトの書き方：出力の質を上げる3つの基本",
    body: `AIツールを使いこなすうえで、プロンプト（AIへの指示文）の書き方は非常に重要です。同じ質問でも、表現の違いによって返ってくる回答の質は大きく変わります。本記事では、誰でもすぐに実践できるプロンプトの基本を3つ紹介します。

## 1. 役割を与える

AIに対して「あなたは〇〇の専門家です」と役割を設定すると、その分野に即した回答が返りやすくなります。たとえば「マーケターとして」「編集者として」のように職種を明示するだけで、視点や語彙が変わります。

プロンプト例：
「あなたはBtoBマーケターです。中小企業向けのメールマーケティングの改善点を3つ挙げてください。」

## 2. 出力形式を指定する

「箇条書きで」「300字以内で」「比較表で」など、欲しい形式をあらかじめ伝えると、後処理が不要になります。フォーマットを指定しないと、AIは毎回異なる形式で返すため、使いにくさを感じることがあります。

## 3. 制約条件を加える

「専門用語を使わず」「初心者にもわかるように」「日本語で」といった制約を加えると、対象読者に合った回答が得られます。制約が多すぎると逆効果になる場合もあるため、本当に必要な条件だけ絞るのがコツです。

## まとめ

プロンプトの精度を上げるには、役割・形式・制約の3点を意識するだけで十分です。最初から完璧を目指す必要はなく、試して修正するサイクルを繰り返すことで、自分に合った書き方が見えてきます。AIは道具であり、使い方次第で得られる価値は大きく変わります。`,
    tags: ["AI活用", "プロンプト術", "仕事効率化"],
  };

  (async () => {
    console.log("==============================");
    console.log("【テスト1】体験談入り note（ng になるはず）");
    console.log("==============================");
    try {
      const result1 = await qc(badInput);
      console.log("\n--- 判定結果 ---");
      console.log("result  :", result1.result);
      console.log("issues  :", result1.issues);
      console.log("fix_hint:", result1.fix_hint);
    } catch (err) {
      console.error("エラー:", err.message);
    }

    console.log("\n==============================");
    console.log("【テスト1b】SNSでっち上げ入り room（ng になるはず）");
    console.log("==============================");
    try {
      const result1b = await qc(fabricatedRoomInput);
      console.log("\n--- 判定結果 ---");
      console.log("result  :", result1b.result);
      console.log("issues  :", result1b.issues);
      console.log("fix_hint:", result1b.fix_hint);
    } catch (err) {
      console.error("エラー:", err.message);
    }

    console.log("\n==============================");
    console.log("【テスト2】ちゃんとした本文（pass になるはず）");
    console.log("==============================");
    try {
      const result2 = await qc(goodInput);
      console.log("\n--- 判定結果 ---");
      console.log("result  :", result2.result);
      console.log("issues  :", result2.issues);
      console.log("fix_hint:", result2.fix_hint);
    } catch (err) {
      console.error("エラー:", err.message);
    }
  })();
}
