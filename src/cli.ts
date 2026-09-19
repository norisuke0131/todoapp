import { TypeSafeClient } from "@typesafe-ai/sdk";
import { classifyTask, type Classification, type TaskInput } from "./classify";
import { createDemoClient } from "./demo-client";
import { findDuplicates, type DedupeResult } from "./dedupe";

interface CliArgs {
  demo: boolean;
  json: boolean;
  dedupe: boolean;
  positionals: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { demo: false, json: false, dedupe: false, positionals: [] };
  for (const a of argv) {
    if (a === "--demo") args.demo = true;
    else if (a === "--json") args.json = true;
    else if (a === "--dedupe") args.dedupe = true;
    else if (a === "--help" || a === "-h") args.positionals.push("__help__");
    else args.positionals.push(a);
  }
  return args;
}

function usage(): string {
  return [
    "使い方: todo-classify [--demo] [--json] \"タスクのタイトル\" [\"補足メモ\"]",
    "        todo-classify --dedupe [--demo] [--json] \"新タスク\" \"既存1\" \"既存2\" ...",
    "",
    "  --demo     APIキー不要のオフラインモック（動作イメージ確認用）",
    "  --json     結果をJSONで出力（他プログラムへの受け渡し用）",
    "  --dedupe   重複検知モード：先頭を新タスク、以降を既存タスクとして意味的重複を判定",
    "  -h         このヘルプ",
    "",
    "本番モードは環境変数 TYPESAFE_API_KEY が必要です（.env.example 参照）。",
    "",
    "例:",
    '  npm run demo -- "明日までに業務用オリーブオイルを発注する"',
    '  npm run demo -- --dedupe "油を頼む" "オリーブオイルを発注" "トマト缶を補充"',
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.positionals.includes("__help__") || args.positionals.length === 0) {
    console.log(usage());
    process.exit(args.positionals.length === 0 ? 1 : 0);
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
