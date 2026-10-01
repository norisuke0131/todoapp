// 決定的な乱数（同じシード値なら毎回同じデータになる）
export type Rng = {
  next(): number
  int(min: number, max: number): number
  pick<T>(list: readonly T[]): T
  chance(p: number): boolean
  shuffle<T>(list: T[]): T[]
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  return {
    next,
    int,
    pick: (list) => {
      const v = list[Math.floor(next() * list.length)]
      if (v === undefined) throw new Error('empty list')
      return v
    },
    chance: (p) => next() < p,
    shuffle: (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const tmp = list[i] as (typeof list)[number]
        list[i] = list[j] as (typeof list)[number]
        list[j] = tmp
      }
      return list
    },
  }
}
