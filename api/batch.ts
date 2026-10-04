import type { VercelRequest, VercelResponse } from "@vercel/node";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  classifyBatch,
  classificationsToRows,
  parseCsv,
  sortByPriority,
  tasksFromCsv,
  toCsv,
} from "../src/batch";
import { createDemoClient } from "../src/demo-client";
import { buildXlsxBuffer } from "../src/xlsx-writer";

/**
 * Web版からのCSV一括分類（ブラウザでアップロード→サーバーで分類→ファイルを返す）。
 *
 * サーバーレス関数には実行時間の上限があり、分類は1件ずつ順に systemOne を
 * 呼ぶ（レート制限対策）ため、本番モードでは件数が多いとタイムアウトし得る。
 * そのため件数に上限を設け、まとまった量は CLI の --batch（タイムアウトなし）
 * に誘導する。
 */
const MAX_BATCH_ROWS = 20;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST のみ対応しています。" });
    return;
  }

  const body = (req.body ?? {}) as { csv?: string; format?: string };
  const csvText = typeof body.csv === "string" ? body.csv : "";
  if (!csvText.trim()) {
    res.status(400).json({ error: "csv（CSVのテキスト）は必須です。" });
    return;
  }
  const format = body.format === "csv" ? "csv" : "xlsx";

  const tasks = tasksFromCsv(parseCsv(csvText));
  if (tasks.length === 0) {
    res
      .status(400)
      .json({ error: "分類できるタスクがありません（title/タイトル/タスク 列が必要です）。" });
    return;
  }
  if (tasks.length > MAX_BATCH_ROWS) {
    res.status(400).json({
      error:
        `Web版は一度に最大${MAX_BATCH_ROWS}件までです（タイムアウト回避のため）。` +
        "それ以上の件数は CLI の --batch（タイムアウトなし）をご利用ください。",
    });
    return;
  }

  const useLive = Boolean(process.env.TYPESAFE_API_KEY);
  const client = useLive ? new TypeSafeClient() : createDemoClient();

  try {
    const results = await classifyBatch(client, tasks);
    const rows = classificationsToRows(sortByPriority(results));

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="result.csv"');
      res.status(200).send(toCsv(rows));
    } else {
      const buffer = await buildXlsxBuffer(rows);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="result.xlsx"');
      res.status(200).send(buffer);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "一括分類に失敗しました。";
    res.status(502).json({ error: message });
  }
}
