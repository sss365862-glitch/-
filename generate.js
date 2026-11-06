// ============================================================
// Vercel側の小さな処理：Geminiに問い合わせてシナリオを返す
// APIキーはここで環境変数 GEMINI_API_KEY から読む（ファイルには書かない）
// モデル名は環境変数 GEMINI_MODEL で変えられる
// ============================================================

const PLACES_JA = "カフェ(cafe)・駅(station)・学校(school)・家(home)";
const ALLOWED = ["待ち時間", "締切", "既読"];

function buildPrompt(target) {
  return `あなたは短いコメディ作家です。
世界から「${target}」というものが消えた架空の世界を考えてください。
街の4か所 ${PLACES_JA} で何が起きるかを、次の順で作ります。

1. first: 「${target}」が消えて、最初は便利になった変化（4か所それぞれ）
2. reasons: カフェ→駅、駅→学校、学校→家 へ影響が伝わる理由（3つ）
3. trouble: その結果、世界に起きた意外な困り事（1つ）
4. adapt: 人々がその世界に変な方法で適応した姿（4か所それぞれ）
5. headline: 架空の新聞の見出し（オチになる一文）

ルール:
- すべて日本語。各文は短く、30文字以内（headlineは35文字以内）
- reasons は12文字以内
- 若者が「わかる」と笑える、自虐っぽいユーモアにする
- 実在の企業名・人名・商品名・サービス名・作品名・キャラクター名は絶対に使わない
- 暴力・差別・性的な内容は書かない
- real_names には、実在の名前を1つでも使ったら true、使っていなければ false を入れる

次のJSONだけを返してください:
{"first":{"cafe":"","station":"","school":"","home":""},"reasons":["","",""],"trouble":"","adapt":{"cafe":"","station":"","school":"","home":""},"headline":"","real_names":false}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const target = req.body && req.body.target;
  if (!ALLOWED.includes(target)) {
    res.status(400).json({ error: "unknown target" });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({ error: "no api key" });
    return;
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(target) }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 1.0 },
        }),
      }
    );
    if (!r.ok) {
      res.status(502).json({ error: "gemini " + r.status });
      return;
    }
    const json = await r.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const data = JSON.parse(text);
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "gemini failed" });
  }
}
