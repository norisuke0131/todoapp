import type { Config } from 'tailwindcss'

const v = (name: string) => `var(--${name})`

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        panel: { DEFAULT: v('panel'), alt: v('panel-alt') },
        line: { DEFAULT: v('line'), hi: v('line-hi') },
        ink: { 900: v('ink-900'), 600: v('ink-600'), 500: v('ink-500'), 400: v('ink-400') },
        primary: { DEFAULT: v('primary'), d: v('primary-d'), 50: v('primary-50') },
        st: {
          stockout: v('st-stockout'),
          low: v('st-low'),
          normal: v('st-normal'),
          excess: v('st-excess'),
          idle: v('st-idle'),
        },
        'st-ink': {
          stockout: v('st-stockout-ink'),
          low: v('st-low-ink'),
          normal: v('st-normal-ink'),
          excess: v('st-excess-ink'),
          idle: v('st-idle-ink'),
        },
        gauge: {
          track: v('gauge-track'),
          onhand: v('gauge-onhand'),
          incoming: v('gauge-incoming'),
          reorder: v('gauge-reorder'),
          safety: v('gauge-safety'),
        },
        exp: { expired: v('exp-expired'), near: v('exp-near') },
        demo: { bg: v('demo-bg'), ink: v('demo-ink'), dim: v('demo-ink-dim'), line: v('demo-line') },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Hiragino Sans', 'Yu Gothic UI', 'system-ui', 'sans-serif'],
        num: ['var(--font-num)', 'Roboto Condensed', 'Arial Narrow', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['22px', { lineHeight: '30px', fontWeight: '700' }],
        section: ['15px', { lineHeight: '22px', fontWeight: '700' }],
        body: ['13px', { lineHeight: '20px' }],
        label: ['11px', { lineHeight: '16px', fontWeight: '700', letterSpacing: '0.05em' }],
        'qty-lg': ['30px', { lineHeight: '32px', fontWeight: '600' }],
        qty: ['14px', { lineHeight: '20px', fontWeight: '600' }],
        'qty-sm': ['12px', { lineHeight: '16px', fontWeight: '600' }],
      },
      borderRadius: { DEFAULT: '3px', sm: '2px', none: '0' },
      boxShadow: { pop: v('shadow-pop') },
      transitionDuration: { 80: '80ms', 160: '160ms', 400: '400ms' },
      spacing: { 13: '52px', 14: '56px', 58: '232px' },
    },
  },
  plugins: [],
} satisfies Config
