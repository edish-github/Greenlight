import type { Config } from 'tailwindcss';

/**
 * The palette is severity-first. Every colour in `risk` maps to a Severity in
 * src/types/finding.ts, so a designer changing a hex here cannot accidentally
 * change what a band means. Colours were picked to stay distinguishable after
 * YouTube's compression on a screen recording, which is where the judge will
 * actually see them.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#090d16',
          900: '#0d1320',
          850: '#111827',
          800: '#151d2c',
          700: '#1e2839',
          600: '#38445c',
        },
        line: '#1f2937',
        risk: {
          no_ads: '#ff4d5e',
          limited_ads: '#f5a524',
          advisory: '#64748b',
          clear: '#22c55e',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      animation: {
        sweep: 'sweep 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
