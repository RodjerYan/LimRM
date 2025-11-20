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
            'primary-dark': '#111827',
            'card-bg': '#1F2937',
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