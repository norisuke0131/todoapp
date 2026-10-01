import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // リポジトリ直下にも package-lock.json があるため、ルートを kura/ に固定する
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
}

export default nextConfig
