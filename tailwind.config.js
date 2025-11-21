/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{api,components,services,utils}/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
  ],
  theme: {
    extend: {
        fontFamily: {
            sans: ['Geist', 'sans-serif'],
            mono: ['Geist Mono', 'monospace'],
        },
        colors: {
            'primary-dark': 'rgb(var(--primary-dark) / <alpha-value>)',
            'card-bg': 'rgb(var(--card-bg) / <alpha-value>)',
            'text-main': 'rgb(var(--text-main) / <alpha-value>)',
            'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
            'accent': '#818cf8',
            'accent-dark': '#6366f1',
            'danger': '#f87171',
            'success': '#34d399',
            'warning': '#fbbf24',
        }
    }
  },
  plugins: [],
}