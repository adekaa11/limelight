import type { Env, Pal, PreparedImage, Rect } from "./types";
import { formatDate } from "../lib/date";
import { rgba } from "../lib/color";
import { clamp, easeOut, lerp } from "../lib/math";
import { mulberry32 } from "../lib/rng";

/**
 * ПОСТОЯННЫЕ ЭЛЕМЕНТЫ (одинаковы у всех дней — по ним серия узнаётся):
 * 9:16, поля 6%, дата сверху слева, название под датой (Cormorant Garamond),
 * фото-зона с паспарту, заметки на полях (Caveat), подпись снизу (Caveat), номер страницы справа внизу.
 * Все размеры — в u = 1% ширины.
 */
export const GRID = {
  margin: 6,
  dateY: 10,
  titleY: 18.5,
  titleSize: 7,
  zone: { x: 6, y: 29, w: 88, h: 104 },
  captionY: 165,
  pageY: 171.5,
  noteSlots: [
    { x: 8, y: 142, rot: -0.035, align: "left" as CanvasTextAlign },
    { x: 93, y: 148, rot: 0.04, align: "right" as CanvasTextAlign },
    { x: 22, y: 155, rot: -0.015, align: "left" as CanvasTextAlign },
  ],
};

export const zoneRect = (u: number): Rect => ({ x: GRID.zone.x * u, y: GRID.zone.y * u, w: GRID.zone.w * u, h: GRID.zone.h * u });

/** Вписать фото в прямоугольник «cover» с зумом и точкой фокуса. Возвращает исходный кроп (для мазков). */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  r: Rect,
  zoom = 1,
  fx = 0.5,
  fy = 0.5,
) {
  const ra = r.w / r.h;
  let cw = sw, ch = sw / ra;
  if (ch > sh) {
    ch = sh;
    cw = sh * ra;
  }
  cw /= zoom;
  ch /= zoom;
  const cx = clamp(fx * sw - cw / 2, 0, sw - cw);
  const cy = clamp(fy * sh - ch / 2, 0, sh - ch);
  ctx.drawImage(src, cx, cy, cw, ch, r.x, r.y, r.w, r.h);
  return { cx, cy, cw, ch };
}

export function drawImageCover(ctx: CanvasRenderingContext2D, img: PreparedImage, r: Rect, zoom = 1, fx = 0.5, fy = 0.5) {
  return drawCover(ctx, img.graded, img.w, img.h, r, zoom, fx, fy);
}

/** Паспарту: тень, поле, тонкий внутренний срез. Возвращает внутренний прямоугольник под фото. */
export function drawPassepartout(ctx: CanvasRenderingContext2D, r: Rect, pal: Pal, u: number, mat = 3, color?: string): Rect {
  ctx.save();
  ctx.fillStyle = rgba("#000000", pal.dark ? 0.35 : 0.12);
  ctx.fillRect(r.x + 0.5 * u, r.y + 0.8 * u, r.w, r.h);
  ctx.fillStyle = color ?? pal.mat;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const inner = { x: r.x + mat * u, y: r.y + mat * u, w: r.w - 2 * mat * u, h: r.h - 2 * mat * u };
  ctx.strokeStyle = rgba(pal.dark ? "#000000" : "#5a4a3a", 0.25);
  ctx.lineWidth = Math.max(1, 0.25 * u);
  ctx.strokeRect(inner.x - 0.2 * u, inner.y - 0.2 * u, inner.w + 0.4 * u, inner.h + 0.4 * u);
  ctx.restore();
  return inner;
}

/** Точка фокуса и зум для k-го кадра (одно фото -> смена кадра = новое кадрирование). */
export function frameFocus(seed: number, k: number, amp = 0.12) {
  const r = mulberry32(seed * 31 + k * 7919);
  return { fx: 0.5 + (r() - 0.5) * amp * 2, fy: 0.45 + (r() - 0.5) * amp * 2, zoom: 1.04 + r() * amp };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Рукописное появление: текст «пишется» слева направо. */
function handwrite(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, k: number, align: CanvasTextAlign) {
  if (k <= 0) return;
  const w = ctx.measureText(text).width;
  const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  ctx.save();
  if (k < 1) {
    ctx.beginPath();
    ctx.rect(left - 20, y - 400, (w + 40) * easeOut(k), 600);
    ctx.clip();
  }
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export interface ConstantsOpts {
  pageNumber?: number;
}

export function drawConstants(ctx: CanvasRenderingContext2D, env: Env, opts: ConstantsOpts = {}) {
  const { u, W, pal, day, t, poster, duration } = env;
  const ink = pal.ink;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;

  // дата
  ctx.font = `500 ${3.4 * u}px "Cormorant Garamond"`;
  ctx.globalAlpha = 0.85;
  ctx.textAlign = "left";
  ctx.fillText(formatDate(day.date).toUpperCase(), GRID.margin * u, GRID.dateY * u);
  ctx.globalAlpha = 1;

  // название: жирность из style.font_weight (энергия дня)
  const weight = Math.round(clamp(day.style.font_weight, 300, 700) / 100) * 100;
  let size = GRID.titleSize * u;
  let lines: string[] = [];
  for (let i = 0; i < 4; i++) {
    ctx.font = `${weight} ${size}px "Cormorant Garamond"`;
    lines = wrap(ctx, day.title, W - 2 * GRID.margin * u);
    if (lines.length <= 2) break;
    size *= 0.88;
  }
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, GRID.margin * u, GRID.titleY * u + i * size * 1.02));

  // заметки на полях: детали из текста, по одной, от руки
  const details = day.text_analysis.details.slice(0, 6);
  if (details.length) {
    const start = 3.6, span = Math.max(4, duration - 8);
    ctx.font = `400 ${4.4 * u}px "Caveat"`;
    details.forEach((d, i) => {
      const at = start + (i * span) / details.length;
      const slot = GRID.noteSlots[i % GRID.noteSlots.length];
      // новая заметка в том же слоте стирает старую
      const nextSame = i + GRID.noteSlots.length < details.length ? start + ((i + GRID.noteSlots.length) * span) / details.length : Infinity;
      if (poster && i >= GRID.noteSlots.length) return;
      if (!poster && (t < at || t > nextSame)) return;
      const k = poster ? 1 : clamp((t - at) / 1.4);
      const fadeOut = poster ? 1 : clamp((nextSame - t) / 0.6);
      ctx.save();
      ctx.translate(slot.x * u, slot.y * u);
      ctx.rotate(slot.rot);
      ctx.globalAlpha = 0.82 * fadeOut;
      handwrite(ctx, "— " + d, 0, 0, k, slot.align);
      ctx.restore();
    });
  }

  // подпись
  const cap = day.style.caption || "";
  if (cap) {
    let cs = 6.4 * u;
    ctx.font = `600 ${cs}px "Caveat"`;
    while (ctx.measureText(cap).width > 76 * u && cs > 3.6 * u) {
      cs *= 0.92;
      ctx.font = `600 ${cs}px "Caveat"`;
    }
    const k = poster ? 1 : clamp((t - 2.2) / 1.8);
    handwrite(ctx, cap, GRID.margin * u, GRID.captionY * u, k, "left");
  }

  // номер страницы
  ctx.font = `italic 400 ${3.4 * u}px "Cormorant Garamond"`;
  ctx.globalAlpha = 0.75;
  ctx.textAlign = "right";
  const n = String(opts.pageNumber ?? 1).padStart(2, "0");
  ctx.fillText(n, (100 - GRID.margin) * u, GRID.pageY * u);
  ctx.fillRect((100 - GRID.margin) * u - ctx.measureText(n).width - 5.5 * u, GRID.pageY * u - 1.1 * u, 4 * u, Math.max(1, 0.18 * u));
  ctx.restore();
}

/** Слой погоды из текста: дождь — тонкие косые линии, снег — точки. Общий для всех техник. */
export function drawWeather(ctx: CanvasRenderingContext2D, env: Env, kind: "rain" | "snow" | null, t: number, high: number) {
  if (!kind) return;
  const { W, H, u, pal, seed } = env;
  const r = mulberry32(seed + 404);
  ctx.save();
  ctx.strokeStyle = rgba(pal.ink, 0.13);
  ctx.fillStyle = rgba(pal.dark ? "#ffffff" : pal.ink, 0.22);
  ctx.lineWidth = Math.max(1, 0.15 * u);
  const n = kind === "rain" ? 46 : 60;
  for (let i = 0; i < n; i++) {
    const sx = r() * W, speed = kind === "rain" ? 55 + r() * 30 : 4 + r() * 4, off = r() * H;
    const y = ((off + t * speed * u) % (H + 20 * u)) - 10 * u;
    if (kind === "rain") {
      const x = sx - (y / H) * 8 * u;
      const len = (4 + r() * 5) * u * (1 + high * 0.3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 0.9 * u, y + len);
      ctx.stroke();
    } else {
      const x = sx + Math.sin(t * 0.8 + i) * 2 * u;
      ctx.beginPath();
      ctx.arc(x, y, lerp(0.25, 0.6, r()) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
