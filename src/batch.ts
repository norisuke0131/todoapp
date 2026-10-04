import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { classifyTask, type Classification, type TaskInput } from "./classify";

/**
 * CSV一括分類：タスク一覧のCSVを読み込み、全件を分類して表形式（CSV）で返す。
 *
 * 外部ライブラリなしで完結させるため、CSVの読み書きは最小実装を持つ。
 * Excelとの往復を想定し、出力にはUTF-8 BOMを付ける（Excelで日本語が化けないように）。
 */

/** UTF-8 BOM。Excelがエンコーディングを正しく判定するために先頭へ付与する。 */
export const UTF8_BOM = "﻿";

/**
 * 最小CSVパーサ（RFC4180準拠寄り）。
 * ダブルクォート囲み、"" によるエスケープ、フィールド内カンマ・改行に対応。
 * 先頭行をヘッダとして扱い、各行をヘッダ名→値のレコードにする。
 */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^﻿/, ""); // 先頭BOMを除去
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // 最終フィールド／行を確定（末尾に改行がない場合）
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonEmpty.length === 0) return [];

  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = (r[i] ?? "").trim()));
    return rec;
  });
}

/** 1つの値をCSV用にクォート（必要な場合のみ）。 */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** レコード配列をCSV文字列にする（先頭にBOM付き）。 */
export function toCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return UTF8_BOM;
  const header = Object.keys(rows[0]);
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((r) => header.map((h) => csvCell(r[h] ?? "")).join(",")),
  ];
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}

/** ヘッダ名のゆらぎを吸収して title / notes 列を取り出す。 */
function pickTaskInput(rec: Record<string, string>): TaskInput | null {
  const title =
    rec.title ?? rec.タイトル ?? rec.タスク ?? rec.task ?? rec.件名 ?? "";
  if (!title.trim()) return null;
  const notes = rec.notes ?? rec.メモ ?? rec.備考 ?? rec.補足 ?? undefined;
  return { title: title.trim(), notes: notes?.trim() || undefined };
}

/** CSVレコード列からタスク入力を抽出（title 欠落行はスキップ）。 */
export function tasksFromCsv(records: Record<string, string>[]): TaskInput[] {
  return records
    .map(pickTaskInput)
    .filter((t): t is TaskInput => t !== null);
}

/**
 * タスクを1件ずつ順に分類する。
 * 並列にすると本番APIのレート制限に当たりやすいため、逐次実行にしている。
 */
export async function classifyBatch(
  client: TypeSafeClient,
  tasks: TaskInput[],
  baseDate: Date = new Date(),
): Promise<Classification[]> {
  const results: Classification[] = [];
  for (const task of tasks) {
    results.push(await classifyTask(client, task, baseDate));
  }
  return results;
}

/**
 * 分類結果を「対応すべき順」に並べ替える（新しい配列を返す。破壊しない）。
 *
 * 優先順位：① 要確認（人間の判断待ち）を先頭に ② 優先度レベル降順（緊急なものが上） ③ 元の順序を保つ（安定ソート）。
 * 「見るべきものが上にある」状態を作ることが目的で、優先度だけの単純降順にはしていない。
 */
export function sortByPriority(results: Classification[]): Classification[] {
  return [...results].sort((a, b) => {
    if (a.needsHumanReview !== b.needsHumanReview) {
      return a.needsHumanReview ? -1 : 1;
    }
    return b.priority.level - a.priority.level;
  });
}

/** 分類結果を出力用の表（レコード配列）に変換する。 */
export function classificationsToRows(
  results: Classification[],
): Record<string, string>[] {
  const pctStr = (p: number) => `${Math.round(p * 100)}%`;
  return results.map((r) => ({
    タスク: r.input.title,
    メモ: r.input.notes ?? "",
    カテゴリ: r.category.label,
    カテゴリ確信度: pctStr(r.category.confidence),
    優先度: r.priority.label,
    優先度レベル: String(r.priority.level),
    期日: r.due.date ?? "",
    進捗: r.progress.label,
    分割要否: r.breakdown.uncertain
      ? "判断保留"
      : r.breakdown.likely
        ? "分割推奨"
        : "分割不要",
    要確認: r.needsHumanReview ? "要確認" : "",
  }));
}
