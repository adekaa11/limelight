import type { Mode, Style, Technique } from "../types";
import type { Pal, PreparedImage } from "./types";
import { hexToRgb, luma, mixRgb, type RGB } from "../lib/color";
import { clamp } from "../lib/math";
import { mulberry32 } from "../lib/rng";

export const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
export const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: false }) as CanvasRenderingContext2D;

// ---------------- шрифты ----------------
let fontsReady: Promise<void> | null = null;
export function ensureFonts() {
  if (!fontsReady) {
    const specs = [300, 400, 500, 600, 700].map((w) => `${w} 32px "Cormorant Garamond"`);
    specs.push('italic 400 32px "Cormorant Garamond"', '400 32px "Caveat"', '600 32px "Caveat"');
    fontsReady = Promise.all(specs.map((s) => document.fonts.load(s, "LimeLight день 0123"))).then(
      () => undefined,
      () => undefined,
    );
  }
  return fontsReady;
}

// ---------------- фото ----------------
const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      if (!url.startsWith("blob:") && !url.startsWith("data:")) img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
    imgCache.set(url, p);
  }
  return p;
}

/**
 * Цветокоррекция фото под палитру дня (постоянный приём: фото всегда «вписаны» в палитру).
 * gradient map по светлоте (палитра от тёмного к светлому) + смешивание с оригиналом,
 * насыщенность и контраст зависят от техники; минор -> насыщенность −25%.
 */
const GRADE: Record<Technique, { k: number; sat: number; contrast: number; lift: number }> = {
  monet: { k: 0.35, sat: 1.05, contrast: 0.95, lift: 0.04 },
  kandinsky: { k: 0.55, sat: 0.75, contrast: 1.25, lift: 0 },
  film: { k: 0.28, sat: 0.85, contrast: 1.05, lift: 0.08 },
  collage: { k: 0.2, sat: 1.25, contrast: 1.1, lift: 0 },
  japanese: { k: 0.5, sat: 0.55, contrast: 0.9, lift: 0.06 },
};

function placeholder(pal: Pal, seed: number) {
  const c = canvas(600, 750);
  const g = ctx2d(c);
  const grd = g.createLinearGradient(0, 0, 600, 750);
  pal.byLuma.forEach((col, i) => grd.addColorStop(i / 4, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, 600, 750);
  const r = mulberry32(seed);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = pal.accents[i % pal.accents.length];
    g.globalAlpha = 0.35;
    g.beginPath();
    g.arc(r() * 600, r() * 750, 40 + r() * 160, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function gradePhoto(img: HTMLImageElement | null, style: Style, mode: Mode, pal: Pal, seed: number, maxSide = 720): HTMLCanvasElement {
  if (!img) return placeholder(pal, seed);
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvas(img.naturalWidth * s, img.naturalHeight * s);
  const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.drawImage(img, 0, 0, c.width, c.height);
  let data: ImageData;
  try {
    data = g.getImageData(0, 0, c.width, c.height);
  } catch {
    return c; // без CORS: показываем как есть
  }
  const p = GRADE[style.technique];
  const sat = p.sat * (mode === "minor" ? 0.75 : 1);
  const energy = clamp((style.motion - 0.15) / 0.75);
  const contrast = p.contrast * (0.9 + 0.25 * energy);
  // LUT: светлота -> цвет палитры
  const stops: RGB[] = [mixRgb(hexToRgb(pal.byLuma[0]), [0, 0, 0], 0.45), ...pal.byLuma.map(hexToRgb), mixRgb(hexToRgb(pal.byLuma[4]), [255, 255, 255], 0.55)];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * (stops.length - 1);
    const a = Math.floor(x), b = Math.min(stops.length - 1, a + 1);
    const col = mixRgb(stops[a], stops[b], x - a);
    lut.set(col.map(Math.round), i * 3);
  }
  const d = data.data;
  const k = p.k, lift = p.lift * 255;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], gg = d[i + 1], b = d[i + 2];
    const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const li = Math.max(0, Math.min(255, Math.round(L))) * 3;
    r += (lut[li] - r) * k;
    gg += (lut[li + 1] - gg) * k;
    b += (lut[li + 2] - b) * k;
    const L2 = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    r = L2 + (r - L2) * sat;
    gg = L2 + (gg - L2) * sat;
    b = L2 + (b - L2) * sat;
    r = (r - 128) * contrast + 128 + lift * (1 - r / 255);
    gg = (gg - 128) * contrast + 128 + lift * (1 - gg / 255);
    b = (b - 128) * contrast + 128 + lift * (1 - b / 255);
    d[i] = r;
    d[i + 1] = gg;
    d[i + 2] = b;
  }
  g.putImageData(data, 0, 0);
  return c;
}

/** Дешёвое размытие без ctx.filter (Safari): уменьшить и растянуть обратно. */
export function blurCanvas(src: HTMLCanvasElement, factor = 12) {
  const small = canvas(src.width / factor, src.height / factor);
  const sg = ctx2d(small);
  sg.imageSmoothingQuality = "high";
  sg.drawImage(src, 0, 0, small.width, small.height);
  const out = canvas(src.width / 3, src.height / 3);
  const og = ctx2d(out);
  og.imageSmoothingQuality = "high";
  og.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

export function prepareImage(key: string, img: HTMLImageElement | null, style: Style, mode: Mode, pal: Pal, seed: number): PreparedImage {
  const graded = gradePhoto(img, style, mode, pal, seed);
  return {
    key,
    graded,
    blur: blurCanvas(graded),
    w: graded.width,
    h: graded.height,
    aspect: graded.width / graded.height,
    cache: new Map(),
  };
}

// ---------------- текстуры ----------------
const noiseTiles: HTMLCanvasElement[] = [];
/** 4 тайла зерна, листаются по кадрам — зерно «живое», как у плёнки. */
export function grainTiles() {
  if (!noiseTiles.length) {
    for (let n = 0; n < 4; n++) {
      const c = canvas(192, 192);
      const g = ctx2d(c);
      const id = g.createImageData(192, 192);
      const r = mulberry32(1000 + n);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = 128 + (r() + r() + r() - 1.5) * 150;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
        id.data[i + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      noiseTiles.push(c);
    }
  }
  return noiseTiles;
}

let paper: HTMLCanvasElement | null = null;
/** Текстура бумаги — одна на весь дневник (постоянный элемент серии). */
export function paperTexture() {
  if (!paper) {
    const S = 384;
    paper = canvas(S, S);
    const g = ctx2d(paper);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, S, S);
    const r = mulberry32(77);
    // мелкое волокно
    const id = g.getImageData(0, 0, S, S);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 255 - r() * 26;
      id.data[i] = v;
      id.data[i + 1] = v - 2;
      id.data[i + 2] = v - 6;
    }
    g.putImageData(id, 0, 0);
    // длинные волокна
    g.strokeStyle = "rgba(120,100,80,0.10)";
    g.lineWidth = 0.7;
    for (let i = 0; i < 140; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI, l = 6 + r() * 22;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  }
  return paper;
}

export const isDark = (hex: string) => luma(hex) < 0.4;
