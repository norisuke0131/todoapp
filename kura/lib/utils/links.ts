// 記事への導線（F-C06, FR-713）。公開時に環境変数で差し替える
export const LINKS = {
  article: process.env.NEXT_PUBLIC_ARTICLE_URL ?? 'https://service.souzoh-official.com/',
  document: process.env.NEXT_PUBLIC_DOC_URL ?? 'https://service.souzoh-official.com/contact/',
  contact: 'https://service.souzoh-official.com/contact/',
} as const
