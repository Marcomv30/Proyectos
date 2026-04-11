/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary:   'var(--emp-accent)',
        secondary: '#b45309',
        surface: {
          base:    'var(--surface-base)',
          raised:  'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          deep:    'var(--surface-deep)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted:   'var(--ink-muted)',
          faint:   'var(--ink-faint)',
        },
        line: {
          DEFAULT: 'var(--line)',
          dim:     'var(--line-dim)',
        },
      },
    },
  },
  plugins: [],
}
