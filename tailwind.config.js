
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{api,components,services,utils}/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        fontFamily: {
            sans: [
                "Inter",
                "system-ui",
                "-apple-system",
                "BlinkMacSystemFont",
                "Segoe UI",
                "Roboto",
                "Ubuntu",
                "Cantarell",
                "Helvetica Neue",
                "Arial",
                "sans-serif",
            ],
            mono: [
                "JetBrains Mono",
                "ui-monospace",
                "SFMono-Regular",
                "Menlo",
                "Monaco",
                "Consolas",
                "Liberation Mono",
                "Courier New",
                "monospace",
            ],
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
