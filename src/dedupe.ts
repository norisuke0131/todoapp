import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { SAME_TASK_QUESTIONS } from "./questions";
import type { TaskInput } from "./classify";

/**
 * O3（重複検知）：新規タスクが既存タスク群と「意味的に同じ」かを判定する。
 *
 * 文字列類似度（レーベンシュタイン距離など）は言い換えに弱く破綻しやすい。
 * ここでは noul（yes/no ＋ 確率）で "実質同一か" を意味レベルで判定する。
 */

/** noul（Yes確率）がこの値以上なら重複候補とみなす。 */
export const DUPLICATE_THRESHOLD = 0.8;

function toText(t: TaskInput): string {
  return t.notes ? `${t.title}（${t.notes}）` : t.title;
}

export interface DuplicateMatch {
  task: TaskInput;
  /** 「同じ作業」の確率（0〜1）。 */
  probability: number;
}

export interface DedupeResult {
  input: TaskInput;
  model: string;
  matches: DuplicateMatch[];
  /** 重複候補があるか（matches が1件以上）。 */
  hasDuplicate: boolean;
}

/**
 * 新規タスクを既存タスク群の各件と1対1で比較し、重複候補を返す。
 * 既存件数が多い場合は候補を事前に絞ってから渡すこと（1件=1呼び出し）。
 */
export async function findDuplicates(
  client: TypeSafeClient,
  input: TaskInput,
  existing: TaskInput[],
  threshold: number = DUPLICATE_THRESHOLD,
): Promise<DedupeResult> {
  const taskA = toText(input);

  const checks = await Promise.all(
    existing.map(async (candidate) => {
      const { model, answers } = await client.systemOne({
        state: { taskA, taskB: toText(candidate) },
        questions: SAME_TASK_QUESTIONS,
      });
      return { candidate, model, probability: answers.same.noul };
    }),
  );

  const matches: DuplicateMatch[] = checks
    .filter((c) => c.probability >= threshold)
    .map((c) => ({ task: c.candidate, probability: c.probability }))
    .sort((a, b) => b.probability - a.probability);

  return {
    input,
    model: checks[0]?.model ?? "n/a",
    matches,
    hasDuplicate: matches.length > 0,
  };
}
