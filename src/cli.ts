import { TypeSafeClient } from "@typesafe-ai/sdk";
import { classifyTask, type Classification, type TaskInput } from "./classify";
import { createDemoClient } from "./demo-client";

interface CliArgs {
  demo: boolean;
  json: boolean;
  positionals: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { demo: false, json: false, positionals: [] };
  for (const a of argv) {
    if (a === "--demo") args.demo = true;
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.positionals.push("__help__");
    else args.positionals.push(a);
  }
  return args;
}

function usage(): string {
  return [
    "使い方: todo-classify [--demo] [--json] \"タスクのタイトル\" [\"補足メモ\"]",
    "",
    "  --demo   APIキー不要のオフラインモック（動作イメージ確認用）",
    "  --json   結果をJSONで出力（他プログラムへの受け渡し用）",
    "  -h       このヘルプ",
    "",
    "本番モードは環境変数 TYPESAFE_API_KEY が必要です（.env.example 参照）。",
    "",
    "例:",
    '  npm run demo -- "明日までに業務用オリーブオイルを発注する"',
    '  npm run classify -- "インスタの新メニュー告知を投稿し、POPも差し替える"',
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.positionals.includes("__help__") || args.positionals.length === 0) {
    console.log(usage());
    process.exit(args.positionals.length === 0 ? 1 : 0);
  }

  const input: TaskInput = {
    title: args.positionals[0],
    notes: args.positionals[1],
  };

  let client: TypeSafeClient;
  if (args.demo) {
    client = createDemoClient();
  } else if (!process.env.TYPESAFE_API_KEY) {
    console.error(
      "エラー: TYPESAFE_API_KEY が未設定です。本番モードにはAPIキーが必要です。\n" +
        "        まず動作を試すなら --demo を付けてください（例: npm run demo -- \"...\"）。",
    );
    process.exit(1);
  } else {
    client = new TypeSafeClient();
  }

  try {
    const result = await classifyTask(client, input);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(render(result));
    }
  } catch (err) {
    console.error("分類に失敗しました:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
