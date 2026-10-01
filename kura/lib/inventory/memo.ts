// メモ化（INV-04, FR-107）
// キーはデータの世代番号（トランザクション追加・引当・発注などで必ず増える seq）。
// 世代が変われば必ず作り直すので、古い在庫を返すことはない。

export type Memo<A, R> = { get(generation: number, arg: A): R; invalidate(): void }

export function memoByGeneration<A, R>(compute: (arg: A) => R): Memo<A, R> {
  let gen: number | undefined
  let cached: R | undefined
  return {
    get(generation, arg) {
      if (gen !== generation || cached === undefined) {
        cached = compute(arg)
        gen = generation
      }
      return cached
    },
    invalidate() {
      gen = undefined
      cached = undefined
    },
  }
}
