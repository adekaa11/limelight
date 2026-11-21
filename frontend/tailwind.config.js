/** @type {import('tailwindcss').Config} */
// Цвета — CSS-переменные (index.css): тёмная «фотолаборатория» по умолчанию и светлая тема «свет включён».
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        room: v("room"), // фон сайта
        room2: v("room2"), // карточки, панели
        line: v("line"), // границы
        text: v("text"), // основной текст
        muted: v("muted"), // подписи
        safelight: v("safelight"), // единственный акцент: красный свет фотолаборатории
        onlight: v("onlight"), // текст на safelight
        print: v("print"), // фотобумага: страницы-воспоминания
        printink: v("printink"), // текст на фотобумаге
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        hand: ["Caveat", "cursive"],
      },
      boxShadow: {
        print: "var(--print-shadow)",
        "print-lift": "var(--print-shadow-lift)",
      },
    },
  },
  plugins: [],
};
