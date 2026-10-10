import type { VercelRequest, VercelResponse } from "@vercel/node";
import { replyTo } from "../src/chat/respond";
import { STORE } from "../src/chat/store-info";

/** 1回の入力として受け付ける最大文字数（荒らし・過大入力の防止）。 */
export const MAX_MESSAGE_LENGTH = 300;

/**
 * Vercel サーバーレス関数：お客様の問い合わせに店舗情報から返信する。
 *
 * 入力内容は保存しない（会話ログを残さない）。応答は store-info.ts に
 * 書かれた事実だけに基づく。
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST のみ対応しています。" });
    return;
  }

  // @vercel/node は application/json のボディを自動でパースする。
  const body = (req.body ?? {}) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message : "";
  if (message.length > MAX_MESSAGE_LENGTH) {
    res
      .status(400)
      .json({ error: `メッセージは${MAX_MESSAGE_LENGTH}文字以内でご入力ください。` });
    return;
  }

  const reply = replyTo(message);
  res.status(200).json({
    ...reply,
    // 引き継ぎ時のみ電話番号を返す（未設定なら null）。
    phone: reply.handoff && STORE.phone ? STORE.phone : null,
  });
}
