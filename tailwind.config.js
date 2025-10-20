/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{api,components,services,utils}/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
    "./index.tsx",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
      colors: {
        'primary-dark': '#0d1117', // almost black, from github
        'card-bg': '#161b22', // card background, from github
        'border-color': 'rgba(139, 148, 158, 0.3)', // subtle border
        'accent': '#8b5cf6', // violet-500
        'accent-hover': '#a78bfa', // violet-400
        'accent-focus': 'rgba(167, 139, 250, 0.4)',
        'danger': '#f87171', // red-400
        'success': '#34d399', // green-400
        'warning': '#fbbf24', // amber-400
        'info': '#60a5fa', // blue-400
      },
      boxShadow: {
        'glow': '0 0 15px 0 rgba(139, 92, 246, 0.25)',
      }
    },
  },
  plugins: [],
}