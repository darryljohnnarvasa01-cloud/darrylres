/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        danger: 'rgb(var(--color-critical) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        navy: 'rgb(var(--color-navy) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        info: 'rgb(var(--color-primary) / <alpha-value>)',
      },
      fontFamily: {
        heading: ['"Instrument Serif"', 'serif'],
        body: ['Figtree', 'sans-serif'],
      },
      boxShadow: {
        card: '0 20px 55px rgba(11, 17, 32, 0.12)',
      },
    },
  },
  plugins: [],
}
