import type { VercelRequest, VercelResponse } from "@vercel/node";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { classifyTask, type TaskInput } from "../src/classify";
import { createDemoClient } from "../src/demo-client";

/**
 * Vercel サーバーレス関数：タスク文を受け取り TypeSafe で分類して返す。
 *
 * APIキー（TYPESAFE_API_KEY）はサーバー側の環境変数にのみ保持し、
 * ブラウザには一切渡さない。キーが設定されていれば本物の Jev 判定、
 * 未設定なら APIキー不要のデモ用モックで応答する（公開デモがそのまま動く）。
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST のみ対応しています。" });
    return;
  }

  // @vercel/node は application/json のボディを自動でパースする。
  const body = (req.body ?? {}) as Partial<TaskInput>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "title（タスクのタイトル）は必須です。" });
    return;
  }
  const notes = typeof body.notes === "string" ? body.notes : undefined;

  const useLive = Boolean(process.env.TYPESAFE_API_KEY);
  const client = useLive ? new TypeSafeClient() : createDemoClient();

  try {
    const result = await classifyTask(client, { title, notes });
    res.status(200).json({ mode: useLive ? "live" : "demo", result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "分類に失敗しました。";
    res.status(502).json({ error: message });
  }
}
