/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#121212',
        surfaceHover: '#1e1e1e',
        primary: '#00FF00',
        primaryHover: '#00cc00',
        secondary: '#B026FF',
        danger: '#ff3333',
        warning: '#ff9900',
        text: '#f0f0f0',
        textMuted: '#a0a0a0',
        border: '#333333'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    },
  },
  plugins: [],
}