import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // 項目スコープでキーを取り除く `const { cost: _cost, ...rest }` を許可する
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    // コンポーネントから Zustand ストアを直接参照しない（必ず lib/repo/ 経由）
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/store', '@/lib/store/*'],
              message: 'ストアは lib/repo/ 経由で参照してください。',
            },
            { group: ['@/lib/seed', '@/lib/seed/*'], message: 'シードは lib/repo/ 経由で参照してください。' },
          ],
        },
      ],
    },
  },
  {
    // lib/inventory と lib/analytics は純粋関数（INV-05）
    files: ['lib/inventory/**/*.ts', 'lib/analytics/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.bench.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: '現在時刻は引数で受け取ってください（INV-05）。',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: '現在時刻は引数で受け取ってください（INV-05）。',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/store*', '@/lib/repo*', 'react', 'zustand'],
              message: '純粋関数のみ（INV-05）。',
            },
          ],
        },
      ],
    },
  },
]
