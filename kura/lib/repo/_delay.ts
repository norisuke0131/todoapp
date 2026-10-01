// 擬似ディレイ（2章）：書き込み系だけに 150〜400ms を入れる。
// ★ 在庫の再算出と一覧の絞り込みには入れない（待たされる業務システムは品質が低く見える）
let enabled = true

export function setDelayEnabled(v: boolean): void {
  enabled = v
}

export async function delay(min = 150, max = 400): Promise<void> {
  if (!enabled) return
  const ms = min + Math.random() * (max - min)
  await new Promise((r) => setTimeout(r, ms))
}
