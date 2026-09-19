import { choice, noul, score } from "@typesafe-ai/sdk";

/**
 * タスクに対して TypeSafe に投げる「質問プリミティブ（判断の最小単位）」の定義。
 *
 * ここが設計の心臓部：日本語のタスク文（自由記述）を、コードが扱える
 * 「型付きの判断」に変換するための問いを宣言している。
 */

/** カテゴリの内部キー（コードが分岐に使う安定した識別子）。 */
export const CATEGORY_KEYS = [
  "work",
  "purchase",
  "shift",
  "promotion",
  "home",
  "other",
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** カテゴリキー → 画面表示用の日本語ラベル。 */
export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  work: "仕事",
  purchase: "仕入れ・発注",
  shift: "シフト",
  promotion: "販促・SNS",
  home: "家庭",
  other: "その他",
};

/** 優先度スコア（0〜3）→ 画面表示用の日本語ラベル。 */
export const PRIORITY_LABEL: Record<number, string> = {
  0: "低（期限なし・いつでも）",
  1: "中（今週中）",
  2: "高（明日まで）",
  3: "最優先（今日中・緊急）",
};

/**
 * TypeSafe に渡す質問の束。
 *
 * - category: choice（named alternatives から1つ選ぶ。confidence と各ラベルの確率が返る）
 * - priority: score（順序ルーブリックに沿った期待スコア。小数もあり得る）
 * - needsBreakdown: noul（Yes の確率を返す yes/no 判定）
 *
 * `as const` で criteria のキーを固定し、SDK が戻り値の型を推論できるようにする。
 */
export const TASK_QUESTIONS = {
  category: choice("このタスクはどのカテゴリに属するか？", {
    work: "店舗運営・接客・調理など日々のオペレーション業務",
    purchase: "食材・備品・消耗品の仕入れや発注、在庫補充",
    shift: "スタッフのシフト作成・調整・勤怠に関すること",
    promotion: "Instagram など SNS 投稿、POP、キャンペーンなどの販促",
    home: "仕事ではなく私生活・家庭のこと",
    other: "上記のいずれにも当てはまらないもの",
  }),
  priority: score("このタスクの緊急度・優先度はどれくらいか？", [
    "期限がなく、いつやってもよい",
    "今週中に片づければよい",
    "明日までに対応する必要がある",
    "今日中に対応すべき緊急のもの",
  ]),
  needsBreakdown: noul(
    "このタスクは複数の作業が混在しており、分割した方がよいか？",
    {
      true: "2つ以上の独立した作業を含んでおり、サブタスクに分けるべき",
      false: "単一の作業で、そのまま実行できる",
    },
  ),
} as const;

export type TaskQuestions = typeof TASK_QUESTIONS;
