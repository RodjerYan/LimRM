/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        fontFamily: {
            sans: ['Inter', 'sans-serif'],
        },
        colors: {
            'primary-dark': '#111827', // Tailwind gray-900
            'card-bg': '#1F2937',      // Tailwind gray-800
            'accent': '#818cf8',      // Tailwind indigo-400
            'accent-dark': '#6366f1', // Tailwind indigo-500
            'danger': '#f87171',      // Tailwind red-400
            'success': '#34d399',     // Tailwind emerald-400
            'warning': '#fbbf24',     // Tailwind amber-400
        }
    },
  },
  plugins: [],
}