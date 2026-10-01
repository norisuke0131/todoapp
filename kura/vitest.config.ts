import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    include: ['lib/**/*.test.ts'],
    exclude: ['lib/**/*.perf.test.ts', 'node_modules/**'],
    environment: 'node',
  },
})
