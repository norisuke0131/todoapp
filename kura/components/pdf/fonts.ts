// PDF に埋め込む日本語フォント（public/fonts/README.md を参照）
import { Font } from '@react-pdf/renderer'

let registered = false

export function registerJapaneseFont(): void {
  if (registered) return
  Font.register({
    family: 'NotoSansJP',
    fonts: [
      { src: '/fonts/NotoSansJP-Regular-subset.ttf', fontWeight: 400 },
      { src: '/fonts/NotoSansJP-Bold-subset.ttf', fontWeight: 700 },
    ],
  })
  // 日本語は単語の区切りがないので、1文字ずつ折り返せるようにする
  Font.registerHyphenationCallback((word) => Array.from(word).flatMap((c) => [c, '']))
  registered = true
}
