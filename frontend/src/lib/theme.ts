import { useEffect, useState } from "react";

/** Тема сайта: «dark» — комната проявки (по умолчанию), «light» — свет включён. Первичная установка — в index.html. */
export type Theme = "dark" | "light";
const KEY = "theme";
const META = { dark: "#14110F", light: "#F4EFE6" };

const current = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META[theme]);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* приватный режим */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
