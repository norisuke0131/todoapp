/**
 * O2（期限解釈）：緊急度スコアから「具体的な期日」を計算する。
 *
 * 設計の要点（スキルの原則「計算はコードに残す」）：
 *   - 緊急度の "意味" の判断は TypeSafe の score に任せる
 *   - 実際の日付計算は、この純粋なコードが担う（ハルシネーション回避・再現性）
 *
 * すべて日本時間（JST, Asia/Tokyo）基準で算出する。
 */

/** JST での「年・月・日・曜日」を取り出す。 */
function jstParts(d: Date): { y: number; m: number; day: number; weekday: number } {
  // Asia/Tokyo は UTC+9 固定（夏時間なし）なので +9h して UTC 値として読む。
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: jst.getUTCFullYear(),
    m: jst.getUTCMonth(),
    day: jst.getUTCDate(),
    weekday: jst.getUTCDay(), // 0=日, 1=月, ... 6=土
  };
}

/** JST の暦日に日数を足して "YYYY-MM-DD（曜）" 文字列にする。 */
function addDaysJst(base: Date, days: number): string {
  const p = jstParts(base);
  const dt = new Date(Date.UTC(p.y, p.m, p.day + days));
  const wd = ["日", "月", "火", "水", "木", "金", "土"][dt.getUTCDay()];
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}（${wd}）`;
}

export interface DueEstimate {
  /** 期日（JST）。期限なしの場合は null。 */
  date: string | null;
  /** 何をもってこの期日にしたかの説明（人間向け）。 */
  rule: string;
}

/**
 * 優先度レベル（0〜3, 丸め済み）と基準日から具体的な期日を計算する。
 *
 * - 0: 期限なし
 * - 1: 今週中 → 今週日曜まで（基準日が日曜ならその日）
 * - 2: 明日まで → 基準日の翌日
 * - 3: 今日中 → 基準日当日
 */
export function estimateDueDate(level: number, base: Date = new Date()): DueEstimate {
  switch (level) {
    case 3:
      return { date: addDaysJst(base, 0), rule: "今日中（当日）" };
    case 2:
      return { date: addDaysJst(base, 1), rule: "明日まで（翌日）" };
    case 1: {
      const { weekday } = jstParts(base);
      const daysToSunday = (7 - weekday) % 7; // 日曜=0 まで
      return {
        date: addDaysJst(base, daysToSunday),
        rule: "今週中（今週日曜まで）",
      };
    }
    default:
      return { date: null, rule: "期限なし" };
  }
}
