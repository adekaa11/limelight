import { grainTiles, paperTexture } from "./prepare";
import { clamp } from "../lib/math";

const patterns = new WeakMap<CanvasRenderingContext2D, { paper: CanvasPattern | null; grain: (CanvasPattern | null)[] }>();
function pats(ctx: CanvasRenderingContext2D) {
  let p = patterns.get(ctx);
  if (!p) {
    p = { paper: ctx.createPattern(paperTexture(), "repeat"), grain: grainTiles().map((t) => ctx.createPattern(t, "repeat")) };
    patterns.set(ctx, p);
  }
  return p;
}

/** Одна бумага на весь дневник: multiply-текстура поверх любой техники. */
export function applyPaper(ctx: CanvasRenderingContext2D, W: number, H: number, u: number) {
  const p = pats(ctx).paper;
  if (!p) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.55;
  ctx.scale(u / 7.2, u / 7.2); // масштаб текстуры не зависит от разрешения
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, (W * 7.2) / u, (H * 7.2) / u);
  ctx.restore();
}

/**
 * Старение записи: f = 0..1 (см. fadeForAge).
 * Выцветание (−насыщенность), пожелтение бумаги, «поднятые» чёрные и тёмные края.
 */
export function applyAging(ctx: CanvasRenderingContext2D, W: number, H: number, f: number) {
  if (f <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "saturation";
  ctx.globalAlpha = clamp(f * 0.6);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = clamp(f * 0.4);
  ctx.fillStyle = "#f1dcb4";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = clamp(f * 0.32);
  ctx.fillStyle = "#4a3c30";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "multiply";
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(1, `rgba(150,110,70,${clamp(f * 0.45)})`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function applyGrain(ctx: CanvasRenderingContext2D, W: number, H: number, amount: number, frameNo: number, rect?: { x: number; y: number; w: number; h: number }) {
  if (amount <= 0.01) return;
  const tiles = pats(ctx).grain;
  const p = tiles[frameNo % tiles.length];
  if (!p) return;
  const r = rect ?? { x: 0, y: 0, w: W, h: H };
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = clamp(amount);
  const ox = (frameNo * 53) % 192, oy = (frameNo * 97) % 192;
  ctx.translate(ox, oy);
  ctx.fillStyle = p;
  ctx.fillRect(r.x - ox, r.y - oy, r.w, r.h);
  ctx.restore();
}

/**
 * «Проявление» при открытии (3 сек): color-dodge светлым серым — тени проявляются первыми,
 * как фотография в ванночке с проявителем. e = 0 (белый лист) .. 1 (проявлено).
 */
export function applyDevelop(ctx: CanvasRenderingContext2D, W: number, H: number, e: number) {
  if (e >= 1) return;
  const v = Math.round((1 - e) * 0.86 * 255);
  ctx.save();
  ctx.globalCompositeOperation = "color-dodge";
  ctx.fillStyle = `rgb(${v},${v},${Math.round(v * 0.94)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "saturation";
  ctx.globalAlpha = clamp(1 - e) * 0.8;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
