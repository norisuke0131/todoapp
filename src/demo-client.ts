import { TypeSafeClient, type Fetch } from "@typesafe-ai/sdk";

/**
 * APIキー不要で動かすための「デモ用クライアント」。
 *
 * 本物の TypeSafe API は呼ばず、SDK の `fetch` 差し替え口に軽量な
 * キーワードヒューリスティックを差し込んで、System One の応答形式
 * （{ model, answers, usage }）を模したJSONを返す。
 *
 * 注意：これは動作イメージを掴むためのモック（模擬）であり、
 * 実際のモデル（Jev）の判定精度・確信度とは無関係。
 */

type Json = Record<string, unknown>;

function normalizeState(state: unknown): string {
  if (typeof state === "string") return state;
  if (state && typeof state === "object") {
    return Object.values(state as Json)
      .filter((v) => typeof v === "string")
      .join(" ");
  }
  return String(state ?? "");
}

/**
 * 生スコアの配列を確率分布（合計1）に正規化する（softmax風の単純版）。
 * scale が大きいほどピークが尖る（確信度が上がる）。
 */
function toProbabilities(scores: number[], scale = 1): number[] {
  const min = Math.min(...scores);
  const shifted = scores.map((s) => Math.exp((s - min) * scale));
  const sum = shifted.reduce((a, b) => a + b, 0);
  return shifted.map((s) => Number((s / sum).toFixed(4)));
}

function countMatches(text: string, words: string[]): number {
  return words.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0);
}

/** choice 質問への模擬回答を作る。criteria のキー順を尊重する。 */
function answerChoice(labels: string[], text: string) {
  const hints: Record<string, string[]> = {
    work: ["接客", "調理", "清掃", "オペレーション", "営業", "レジ", "仕込み"],
    purchase: ["発注", "仕入", "在庫", "備品", "消耗品", "補充", "納品"],
    shift: ["シフト", "勤怠", "休み", "出勤", "人員", "スタッフ配置"],
    promotion: ["Instagram", "インスタ", "SNS", "投稿", "POP", "販促", "キャンペーン"],
    home: ["家", "家族", "私用", "プライベート", "買い物", "病院"],
    other: [],
  };
  const raw = labels.map((label) => {
    const words = hints[label] ?? [];
    const base = label === "other" ? 0.3 : 0.0;
    return base + countMatches(text, words);
  });
  const probs = toProbabilities(raw, 2.4);
  const probabilities: Record<string, number> = {};
  labels.forEach((label, i) => (probabilities[label] = probs[i]));
  let bestIdx = 0;
  probs.forEach((p, i) => (bestIdx = p > probs[bestIdx] ? i : bestIdx));
  return {
    type: "choice" as const,
    choice: labels[bestIdx],
    confidence: probs[bestIdx],
    probabilities,
  };
}

/** score 質問への模擬回答を作る。levels は criteria の要素数。 */
function answerScore(criteria: unknown[], text: string) {
  const levels = criteria.length;
  const urgent = countMatches(text, ["今日", "至急", "緊急", "今すぐ", "本日"]);
  const soon = countMatches(text, ["明日", "明後日", "締切", "期限"]);
  const week = countMatches(text, ["今週", "週内", "近日"]);
  let expected = 1; // 既定は「今週中」寄り
  if (urgent > 0) expected = levels - 1;
  else if (soon > 0) expected = Math.min(levels - 2, 2);
  else if (week > 0) expected = 1;
  else expected = 1;

  // 期待値まわりに山を作った確率分布（scale を上げてピークを尖らせる）。
  const raw = criteria.map((_, i) => -Math.abs(i - expected));
  const probs = toProbabilities(raw, 1.9);
  const probabilities: Record<string, number> = {};
  const legend: Record<string, unknown> = {};
  criteria.forEach((desc, i) => {
    probabilities[String(i)] = probs[i];
    legend[String(i)] = desc;
  });
  const score = probs.reduce((acc, p, i) => acc + p * i, 0);
  return {
    type: "score" as const,
    score: Number(score.toFixed(3)),
    confidence: Math.max(...probs),
    legend,
    probabilities,
  };
}

/** noul（yes/no）質問への模擬回答を作る。 */
function answerNoul(text: string) {
  const separators = countMatches(text, ["、", "および", "＆", "&", "＋", "+", "・", "も", "し、", "ながら", "つつ"]);
  const verbs = countMatches(text, ["する", "作る", "確認", "連絡", "準備", "発注", "投稿", "差し替え", "掃除", "返信"]);
  const raw = Math.min(0.12 + separators * 0.22 + Math.max(0, verbs - 1) * 0.2, 0.95);
  return { type: "noul" as const, noul: Number(raw.toFixed(3)) };
}

const demoFetch: Fetch = async (_input, init) => {
  const body = init?.body ? (JSON.parse(String(init.body)) as Json) : {};
  const state = normalizeState(body.state);
  const questions = (body.questions ?? {}) as Record<string, Json>;

  const answers: Record<string, unknown> = {};
  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "choice") {
      answers[name] = answerChoice(Object.keys(q.criteria as Json), state);
    } else if (q.type === "score") {
      answers[name] = answerScore(q.criteria as unknown[], state);
    } else {
      answers[name] = answerNoul(state);
    }
  }

  const payload = {
    model: (body.model as string) ?? "jev-demo",
    answers,
    usage: { input_tokens: state.length, output_tokens: 0 },
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-typesafe-request-id": "demo-request",
    },
  });
};

/** デモ用に fetch を差し替えた TypeSafeClient を返す（APIキー不要）。 */
export function createDemoClient(): TypeSafeClient {
  return new TypeSafeClient({
    apiKey: "demo-key",
    fetch: demoFetch,
    logLevel: "off",
  });
}
