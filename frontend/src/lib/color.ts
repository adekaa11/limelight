export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]: RGB) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};

/** Относительная светлота 0..1 (для сортировки и контраста). */
export const luma = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export const mixRgb = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const mixHex = (a: string, b: string, k: number) => rgbToHex(mixRgb(hexToRgb(a), hexToRgb(b), k));

export function adjustHex(hex: string, { l = 0, s = 0 }: { l?: number; s?: number }) {
  const [h, ss, ll] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb(h, Math.max(0, Math.min(1, ss + s)), Math.max(0, Math.min(1, ll + l))));
}

/** Цвет «чернил» для текста поверх фона: тёмный на светлом, светлый на тёмном, в тоне палитры. */
export function inkFor(bg: string, palette: string[]) {
  const dark = luma(bg) < 0.45;
  const sorted = [...palette.slice(1)].sort((a, b) => luma(a) - luma(b));
  const candidate = dark ? sorted[sorted.length - 1] : sorted[0];
  const ok = Math.abs(luma(candidate) - luma(bg)) > 0.45;
  if (ok) return candidate;
  return dark ? mixHex(candidate, "#f6f1e7", 0.75) : mixHex(candidate, "#1e1a17", 0.8);
}

/** CSS-градиент палитры (для «Года в цветах» и полосок в архиве). */
export const paletteGradient = (p: string[], angle = 135) =>
  `linear-gradient(${angle}deg, ${p.slice(1).concat(p[0]).map((c, i, a) => `${c} ${Math.round((i / (a.length - 1)) * 100)}%`).join(", ")})`;
