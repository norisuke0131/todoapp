import type { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  TASK_QUESTIONS,
  type CategoryKey,
} from "./questions";

/** タスクの入力。title は必須、notes は補足メモ（任意）。 */
export interface TaskInput {
  title: string;
  notes?: string;
}

/**
 * 確信度のしきい値。これを下回る判断は「自動適用せず人間レビューに回す」。
 * 不確実な判断を勝手に確定させない（＝誤分類の押し付けを防ぐ）ための境界。
 */
export const CONFIDENCE_THRESHOLD = 0.7;

/** noul（Yes確率）が中間帯なら「どちらとも言い切れない」とみなす幅。 */
export const NOUL_UNCERTAIN_BAND: readonly [number, number] = [0.4, 0.6];

export interface CategoryVerdict {
  key: CategoryKey;
  label: string;
  confidence: number;
  /** confidence がしきい値未満で、人間の確認が必要か。 */
  needsReview: boolean;
  probabilities: Readonly<Record<string, number>>;
}

export interface PriorityVerdict {
  /** 期待スコア（0〜3、小数あり）。 */
  score: number;
  /** 表示・保存用に丸めた整数レベル（0〜3）。 */
  level: number;
  label: string;
  confidence: number;
  needsReview: boolean;
}

export interface BreakdownVerdict {
  /** 「分割した方がよい」の確率（0〜1）。 */
  probability: number;
  likely: boolean;
  /** 中間帯で判断を保留すべきか。 */
  uncertain: boolean;
}

export interface Classification {
  input: TaskInput;
  model: string;
  category: CategoryVerdict;
  priority: PriorityVerdict;
  breakdown: BreakdownVerdict;
  /** いずれかの判断が人間レビュー行きなら true。 */
  needsHumanReview: boolean;
  usage: { input_tokens: number; output_tokens: number };
}

/** score を 0〜(レベル数-1) の整数に丸める。 */
function clampLevel(score: number, levels: number): number {
  const rounded = Math.round(score);
  return Math.min(Math.max(rounded, 0), levels - 1);
}

/**
 * 1件のタスクを TypeSafe（System One）で判定し、型付きの分類結果に整形する。
 *
 * ワークフローの主役はこのコード側：1回の systemOne 呼び出しで
 * カテゴリ・優先度・分割要否の3判断をまとめて取得し、confidence を見て
 * 自動適用かレビュー行きかを決める。
 */
export async function classifyTask(
  client: TypeSafeClient,
  input: TaskInput,
): Promise<Classification> {
  // state には構造化した JSON を渡す（テキストでも可だが、項目が分かれる方が明確）。
  const state = {
    title: input.title,
    notes: input.notes ?? null,
  };

  const { model, answers, usage } = await client.systemOne({
    state,
    questions: TASK_QUESTIONS,
  });

  const categoryKey = answers.category.choice as CategoryKey;
  const category: CategoryVerdict = {
    key: categoryKey,
    label: CATEGORY_LABEL[categoryKey] ?? categoryKey,
    confidence: answers.category.confidence,
    needsReview: answers.category.confidence < CONFIDENCE_THRESHOLD,
    probabilities: answers.category.probabilities,
  };

  const priorityLevels = TASK_QUESTIONS.priority.criteria.length;
  const level = clampLevel(answers.priority.score, priorityLevels);
  const priority: PriorityVerdict = {
    score: answers.priority.score,
    level,
    label: PRIORITY_LABEL[level] ?? String(level),
    confidence: answers.priority.confidence,
    needsReview: answers.priority.confidence < CONFIDENCE_THRESHOLD,
  };

  const p = answers.needsBreakdown.noul;
  const [lo, hi] = NOUL_UNCERTAIN_BAND;
  const breakdown: BreakdownVerdict = {
    probability: p,
    likely: p >= hi,
    uncertain: p > lo && p < hi,
  };

  const needsHumanReview =
    category.needsReview || priority.needsReview || breakdown.uncertain;

  return {
    input,
    model,
    category,
    priority,
    breakdown,
    needsHumanReview,
    usage,
  };
}
