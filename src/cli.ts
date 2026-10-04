import { readFileSync, writeFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { classifyTask, type Classification, type TaskInput } from "./classify";
import { createDemoClient } from "./demo-client";
import { findDuplicates, type DedupeResult } from "./dedupe";
import {
  classificationsToRows,
  classifyBatch,
  parseCsv,
  sortByPriority,
  tasksFromCsv,
  toCsv,
} from "./batch";
import { writeXlsx } from "./xlsx-writer";

interface CliArgs {
  demo: boolean;
  json: boolean;
  dedupe: boolean;
  batch: string | null;
  noSort: boolean;
  positionals: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    demo: false,
    json: false,
    dedupe: false,
    batch: null,
    noSort: false,
    positionals: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--demo") args.demo = true;
    else if (a === "--json") args.json = true;
    else if (a === "--dedupe") args.dedupe = true;
    else if (a === "--batch") args.batch = argv[++i] ?? "";
    else if (a === "--no-sort") args.noSort = true;
    else if (a === "--help" || a === "-h") args.positionals.push("__help__");
    else args.positionals.push(a);
  }
  return args;
}

function usage(): string {
  return [
    "使い方: todo-classify [--demo] [--json] \"タスクのタイトル\" [\"補足メモ\"]",
    "        todo-classify --dedupe [--demo] [--json] \"新タスク\" \"既存1\" \"既存2\" ...",
    "        todo-classify --batch <入力.csv> [出力.csv|出力.xlsx] [--demo] [--no-sort]",
    "",
    "  --demo         APIキー不要のオフラインモック（動作イメージ確認用）",
    "  --json         結果をJSONで出力（他プログラムへの受け渡し用）",
    "  --dedupe       重複検知モード：先頭を新タスク、以降を既存タスクとして意味的重複を判定",
    "  --batch <file> 一括分類：title(またはタイトル/タスク)列を持つCSVを全件分類",
    "                 出力パスの拡張子が .xlsx ならExcelネイティブ形式（要確認行を自動ハイライト）",
    "  --no-sort      一括分類の出力を「要確認→優先度順」に並べ替えない（入力順のまま出力）",
    "  -h             このヘルプ",
    "",
    "本番モードは環境変数 TYPESAFE_API_KEY が必要です（.env.example 参照）。",
    "",
    "例:",
    '  npm run demo -- "明日までに業務用オリーブオイルを発注する"',
    '  npm run demo -- --dedupe "油を頼む" "オリーブオイルを発注" "トマト缶を補充"',
    "  npm run classify -- --batch tasks.csv result.xlsx --demo",
  ].join("\n");
}

function bar(p: number, width = 20): string {
  const filled = Math.round(p * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function pct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

function render(r: Classification): string {
  const lines: string[] = [];
  lines.push(`■ タスク: ${r.input.title}`);
  if (r.input.notes) lines.push(`  メモ: ${r.input.notes}`);
  lines.push(`  モデル: ${r.model}`);
  lines.push("");

  const catFlag = r.category.needsReview ? " ⚠ 要確認" : "";
  lines.push(`● カテゴリ : ${r.category.label}  (確信度 ${pct(r.category.confidence)})${catFlag}`);

  const priFlag = r.priority.needsReview ? " ⚠ 要確認" : "";
  lines.push(
    `● 優先度   : ${r.priority.label}  [レベル ${r.priority.level} / スコア ${r.priority.score.toFixed(2)}]  (確信度 ${pct(r.priority.confidence)})${priFlag}`,
  );

  lines.push(`● 期日     : ${r.due.date ?? "なし"}  (${r.due.rule})`);

  const prFlag = r.progress.needsReview ? " ⚠ 要確認" : "";
  lines.push(`● 進捗     : ${r.progress.label}  (確信度 ${pct(r.progress.confidence)})${prFlag}`);

  const bd = r.breakdown;
  const bdText = bd.uncertain
    ? "判断保留（中間帯）"
    : bd.likely
      ? "分割推奨"
      : "分割不要";
  lines.push(`● 分割要否 : ${bdText}  (Yes確率 ${pct(bd.probability)})`);
  lines.push("");

  lines.push("  カテゴリ確率:");
  for (const [label, p] of Object.entries(r.category.probabilities)) {
    lines.push(`    ${bar(p)} ${pct(p)}  ${label}`);
  }
  lines.push("");

  lines.push(
    r.needsHumanReview
      ? "→ 判断: 一部が確信度不足のため【人間レビューに回す】"
      : "→ 判断: 全項目が高確信度のため【自動適用OK】",
  );
  return lines.join("\n");
}

function renderDedupe(r: DedupeResult): string {
  const lines: string[] = [];
  lines.push(`■ 新タスク: ${r.input.title}`);
  lines.push(`  モデル: ${r.model}`);
  lines.push("");
  if (!r.hasDuplicate) {
    lines.push("→ 重複候補なし（既存タスクと意味的に一致するものはありません）");
    return lines.join("\n");
  }
  lines.push("⚠ 重複候補が見つかりました:");
  for (const m of r.matches) {
    lines.push(`    ${bar(m.probability)} ${pct(m.probability)}  ${m.task.title}`);
  }
  lines.push("");
  lines.push("→ 判断: 二重登録の可能性あり。既存タスクへの統合を検討してください。");
  return lines.join("\n");
}

function makeClient(demo: boolean): TypeSafeClient | null {
  if (demo) return createDemoClient();
  if (!process.env.TYPESAFE_API_KEY) {
    console.error(
      "エラー: TYPESAFE_API_KEY が未設定です。本番モードにはAPIキーが必要です。\n" +
        "        まず動作を試すなら --demo を付けてください（例: npm run demo -- \"...\"）。",
    );
    return null;
  }
  return new TypeSafeClient();
}

function defaultOutPath(input: string): string {
  return input.replace(/\.csv$/i, "") + ".classified.csv";
}

async function runBatch(
  client: TypeSafeClient,
  inputPath: string,
  outPath: string,
  noSort: boolean,
): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(inputPath, "utf8");
  } catch {
    console.error(`エラー: 入力ファイルを読み込めません: ${inputPath}`);
    process.exit(1);
  }
  const tasks = tasksFromCsv(parseCsv(raw));
  if (tasks.length === 0) {
    console.error("エラー: 分類できるタスクがありません（title/タイトル/タスク 列が必要です）。");
    process.exit(1);
  }
  console.log(`${tasks.length}件を分類中…`);
  const results = await classifyBatch(client, tasks);
  const ordered = noSort ? results : sortByPriority(results);
  const rows = classificationsToRows(ordered);

  if (/\.xlsx$/i.test(outPath)) {
    await writeXlsx(rows, outPath);
  } else {
    writeFileSync(outPath, toCsv(rows), "utf8");
  }

  const review = results.filter((r) => r.needsHumanReview).length;
  const order = noSort ? "" : "（要確認→優先度順に並べ替え済み）";
  console.log(`完了: ${results.length}件を分類し ${outPath} に出力しました（うち要確認 ${review}件）。${order}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.positionals.includes("__help__")) {
    console.log(usage());
    process.exit(0);
  }

  // 一括分類モード（入力ファイルは --batch で指定、出力は任意の位置引数）
  if (args.batch !== null) {
    if (!args.batch) {
      console.error("エラー: --batch には入力CSVのパスを指定してください。");
      process.exit(1);
    }
    const client = makeClient(args.demo);
    if (!client) process.exit(1);
    const outPath = args.positionals[0] ?? defaultOutPath(args.batch);
    try {
      await runBatch(client, args.batch, outPath, args.noSort);
    } catch (err) {
      console.error("一括分類に失敗しました:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
    return;
  }

  if (args.positionals.length === 0) {
    console.log(usage());
    process.exit(1);
  }

  const client = makeClient(args.demo);
  if (!client) process.exit(1);

  try {
    if (args.dedupe) {
      if (args.positionals.length < 2) {
        console.error("エラー: --dedupe には新タスクと既存タスクを1件以上指定してください。");
        process.exit(1);
      }
      const [newTitle, ...existing] = args.positionals;
      const result = await findDuplicates(
        client,
        { title: newTitle },
        existing.map((title) => ({ title })),
      );
      console.log(args.json ? JSON.stringify(result, null, 2) : renderDedupe(result));
      return;
    }

    const input: TaskInput = {
      title: args.positionals[0],
      notes: args.positionals[1],
    };
    const result = await classifyTask(client, input);
    console.log(args.json ? JSON.stringify(result, null, 2) : render(result));
  } catch (err) {
    console.error("処理に失敗しました:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
