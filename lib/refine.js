// NG記事を自動で直す「修正ループ」
// qc にかけて NG なら Claude Sonnet に直させ、再チェックする。最大 maxTries 回。
// ※ 環境変数の「値」は絶対に console.log に出さない

const { qc } = require("./qc");

// ─────────────────────────────────────────
// JSON 文字列内の未エスケープ " を修復するヘルパー
// Claude が body 値の中に "word" のようなダブルクォートを混入させたとき用。
// ─────────────────────────────────────────
function repairJsonQuotes(text) {
  let result = "";
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];

    if (ch === '"' && prev !== "\\") {
      if (!inString) {
        // 文字列の開始
        inString = true;
        result += ch;
      } else {
        // 文字列の終了か、内部の未エスケープ " か を判定する。
        // 次の非空白文字が JSON の構造文字（: , } ]）なら終了クォート、
        // それ以外なら値の途中に紛れ込んだ " なのでエスケープする。
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        const nextNonWs = text[j];
        if (
          nextNonWs === ":" ||
          nextNonWs === "," ||
          nextNonWs === "}" ||
          nextNonWs === "]" ||
          j >= text.length
        ) {
          inString = false;
          result += ch; // 終了クォートはそのまま
        } else {
          result += '\\"'; // 値の中の " はエスケープ
        }
      }
    } else {
      result += ch;
    }
  }
  return result;
}

// ─────────────────────────────────────────
// Claude Sonnet に「NG理由を踏まえて記事を作り直す」よう頼む
// ─────────────────────────────────────────
async function fixArticle(input, issues, fix_hint) {
  // 関数内で読む（dotenvがいつ呼ばれても確実に値が取れる）
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const { kind, title = "", body = "", tags = [] } = input;
  const isJapanese = kind === "room" || kind === "note";

  // ── kind ごとの文字数目安を文字列で用意 ──
  const lengthGuide = {
    room: "日本語150〜250字（スペース・改行を除いた文字数）",
    note: "日本語1200〜1800字（スペース・改行を除いた文字数）",
    medium: "英語700〜1000 words",
  }[kind];

  // ── 元の記事を文字列化 ──
  const originalContent = isJapanese
    ? [
        title ? `【タイトル】${title}` : "",
        `【本文】${body}`,
        tags.length > 0 ? `【タグ】${tags.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : [
        title ? `[Title] ${title}` : "",
        `[Body] ${body}`,
        tags.length > 0 ? `[Tags] ${tags.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

  // ── 問題点リスト ──
  const issueText = issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n");

  const prompt = isJapanese
    ? `
以下の記事が品質チェックで不合格でした。
問題点とヒントを踏まえ、すべて修正した完成版を作り直してください。

【問題点】
${issueText}

【直し方のヒント】
${fix_hint || "（ヒントなし）"}

【守る条件】
- 元のテーマ・言語（日本語）は変えない。
- 匿名厳守：「私は実際に…」などの作り話の一人称体験談、個人を特定する情報は入れない。
- 誇大表現・効果の断定はしない。
- 文字数目安：${lengthGuide}
- 語源・歴史が不確かな記述は書かない。
- 出力はJSONのみ。前置き・説明・コードブロック記号（\`\`\`）は一切出力しない。
- 【重要】body や title の値の中ではダブルクォート（"）を絶対に使わない。引用が必要なら「」を使う。

【元の記事】
${originalContent}

${
  kind === "room"
    ? `出力形式：\n{ "body": "修正後の紹介文" }`
    : `出力形式：\n{ "title": "修正後のタイトル", "body": "修正後の本文", "tags": ["タグ1", "タグ2"] }`
}
`.trim()
    : `
The following article failed quality review.
Please rewrite it as a complete, corrected version based on the issues and hint below.

[Issues]
${issueText}

[Fix hint]
${fix_hint || "(no hint)"}

[Rules to follow]
- Keep the same topic and language (English).
- No first-person fabricated anecdotes ("When I lived in Japan, I...") or personally identifying information.
- No exaggerated claims or unsubstantiated promises.
- Length target: ${lengthGuide}
- Do not include uncertain etymologies or unverified historical claims.
- Output JSON only. No preamble, no explanation, no code fences (\`\`\`).
- IMPORTANT: Do NOT use double quote characters (") inside any text value. Use single quotes or 「」 instead.

[Original article]
${originalContent}

Output format:
{ "title": "revised title", "body": "revised body", "tags": ["Tag1", "Tag2"] }
`.trim();

  const maxTokens = kind === "room" ? 1024 : 3000;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
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

  let fixed;
  try {
    // ── まず素直に JSON.parse ──
    fixed = JSON.parse(jsonMatch[0]);
  } catch (_) {
    // ── フォールバック：本文内のダブルクォートをスキャンしてエスケープ ──
    // Claude が body 値の中に " を混入させた場合（例："ワンピース"）に対処する。
    const repaired = repairJsonQuotes(jsonMatch[0]);
    try {
      fixed = JSON.parse(repaired);
    } catch (e2) {
      throw new Error(
        `JSON.parse に失敗しました（修復試行後）: ${e2.message}\n抽出テキスト: ${jsonMatch[0].slice(0, 120)}`
      );
    }
  }

  return fixed; // { body } または { title, body, tags }
}

// ─────────────────────────────────────────
// メイン関数
//   input   : { kind, title, body, tags }
//   maxTries: 直しを試す最大回数（既定2回）
//   戻り値  : { kind, title, body, tags, result, issues, fix_hint, tries }
// ─────────────────────────────────────────
async function refine(input, maxTries = 2) {
  let current = { ...input }; // 現在の記事（直すたびに上書き）
  let tries = 0;              // 実際に直した回数

  console.log("▶ refine スタート（最大修正回数:", maxTries, "）");

  // ── 初回 QC ──
  console.log("\n─── 初回チェック ───");
  let qcResult = await qc(current);
  console.log(`  → 判定: ${qcResult.result}`);

  // ── 修正ループ ──
  while (qcResult.result === "ng" && tries < maxTries) {
    tries++;
    console.log(`\n─── 修正 ${tries}回目（Sonnet が直しています...）───`);

    const fixed = await fixArticle(current, qcResult.issues, qcResult.fix_hint);

    // 修正結果を current に反映（room は body のみ、それ以外は全フィールド）
    if (current.kind === "room") {
      current = { ...current, body: fixed.body ?? current.body };
    } else {
      current = {
        ...current,
        title: fixed.title ?? current.title,
        body: fixed.body ?? current.body,
        tags: fixed.tags ?? current.tags,
      };
    }

    console.log(`  修正後タイトル: ${current.title || "(room)"}`);

    // 修正後に再 QC
    console.log(`\n─── 修正 ${tries}回目の再チェック ───`);
    qcResult = await qc(current);
    console.log(`  → 判定: ${qcResult.result}`);
  }

  if (qcResult.result === "pass") {
    console.log(`\n✓ pass になりました（修正回数: ${tries}回）`);
  } else {
    console.log(`\n⚠️  ${maxTries}回試しても ng のまま。要人間確認。`);
  }

  return {
    kind: current.kind,
    title: current.title ?? "",
    body: current.body ?? "",
    tags: current.tags ?? [],
    result: qcResult.result,
    issues: qcResult.issues,
    fix_hint: qcResult.fix_hint,
    tries,
  };
}

module.exports = { refine };

// ─────────────────────────────────────────
// ローカルテスト用（node lib/refine.js で実行したときだけ動く）
// ─────────────────────────────────────────
if (require.main === module) {
  require("dotenv").config({ path: ".env.local" });

  // わざと短く・一人称体験談入りの note サンプル（→ NG → 修正 → pass を期待）
  const badInput = {
    kind: "note",
    title: "AIを使った仕事術",
    body: "私は実際にAIを使ってみましたが、すごく生産性が上がりました！おすすめです。効果は絶大です。",
    tags: ["AI", "仕事術"],
  };

  refine(badInput, 2)
    .then((result) => {
      console.log("\n===== refine 最終結果 =====");
      console.log("result   :", result.result);
      console.log("tries    :", result.tries, "回修正");
      console.log("title    :", result.title);
      console.log("tags     :", result.tags.join(" / "));
      console.log("issues   :", result.issues);
      console.log("fix_hint :", result.fix_hint);
      console.log("\n本文（最初の200字）:");
      console.log(result.body.slice(0, 200) + (result.body.length > 200 ? "..." : ""));
    })
    .catch((err) => {
      console.error("エラー:", err.message);
      process.exit(1);
    });
}
