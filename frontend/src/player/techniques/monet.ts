import type { Style } from "../../types";
import type { AudioFrame, Env, PrepEnv, PreparedImage, TechniqueRenderer } from "../types";
import { canvas, ctx2d } from "../prepare";
import { drawCover, drawPassepartout, frameFocus } from "../layout";
import { rgbToHex, rgbToHsl, hslToRgb, rgba } from "../../lib/color";
import { clamp, easeInOut, lerp } from "../../lib/math";
import { mulberry32 } from "../../lib/rng";

/**
 * МОНЕ — импрессионизм. Спокойные, тёплые дни, медленный мажор.
 * Фото пересобирается из изогнутых мазков: цвет берётся из пикселя, направление — вдоль контуров
 * (перпендикулярно градиенту яркости). Мазки размывают контуры, как память размывает детали.
 * Мазки считаются один раз и кэшируются в «картину»; живыми остаются ~250 мазков сверху,
 * которые качаются от высоких частот и растут от баса.
 */
interface Stroke {
  x: number; y: number; // 0..1 по фото
  a: number; len: number; w: number; // len, w — доли ширины фото
  c: string; bend: number;
}

function buildStrokes(img: PreparedImage, density: number, seed: number) {
  const S = 180;
  const sw = S, sh = Math.max(8, Math.round(S / img.aspect));
  const c = canvas(sw, sh);
  const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.drawImage(img.graded, 0, 0, sw, sh);
  let d: Uint8ClampedArray;
  try {
    d = g.getImageData(0, 0, sw, sh).data;
  } catch {
    return { coarse: [], fine: [], live: [] };
  }
  const L = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  const at = (x: number, y: number) => L[clamp(Math.round(y), 0, sh - 1) * sw + clamp(Math.round(x), 0, sw - 1)];
  const r = mulberry32(seed);
  const sample = (nx: number, ny: number, jitter: number) => {
    const x = nx * (sw - 1), y = ny * (sh - 1);
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    const mag = Math.hypot(gx, gy);
    const i = (clamp(Math.round(y), 0, sh - 1) * sw + clamp(Math.round(x), 0, sw - 1)) * 4;
    const [h, s, l] = rgbToHsl([d[i], d[i + 1], d[i + 2]]);
    const col = rgbToHex(hslToRgb(h + (r() - 0.5) * 10, clamp(s * (1.05 + (r() - 0.5) * 0.2)), clamp(l + (r() - 0.5) * jitter)));
    const a = mag > 0.08 ? Math.atan2(gy, gx) + Math.PI / 2 : -0.5 + (r() - 0.5) * 0.9;
    return { col, a, mag };
  };
  const make = (step: number, len: [number, number], w: [number, number], jitter: number) => {
    const out: (Stroke & { mag: number })[] = [];
    const stepY = step * img.aspect;
    for (let y = 0; y < 1; y += stepY) {
      for (let x = 0; x < 1; x += step) {
        const nx = clamp(x + (r() - 0.2) * step * 1.4), ny = clamp(y + (r() - 0.2) * stepY * 1.4);
        const s = sample(nx, ny, jitter);
        out.push({ x: nx, y: ny, a: s.a, len: lerp(len[0], len[1], r()) * (1 - Math.min(0.5, s.mag)), w: lerp(w[0], w[1], r()), c: s.col, bend: (r() - 0.5) * 0.8, mag: s.mag });
      }
    }
    // перемешиваем, чтобы мазки ложились без «строк»
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const coarse = make(1 / 24, [0.06, 0.1], [0.028, 0.04], 0.1);
  const fine = make(lerp(1 / 60, 1 / 85, density), [0.022, 0.045], [0.008, 0.014], 0.08);
  const live = [...fine].sort((a, b) => b.mag - a.mag).slice(0, 260);
  return { coarse, fine, live };
}

function strokePath(ctx: CanvasRenderingContext2D, s: Stroke, X: number, Y: number, scale: number, da = 0, dl = 1) {
  const a = s.a + da, l = s.len * scale * dl;
  const dx = Math.cos(a) * l * 0.5, dy = Math.sin(a) * l * 0.5;
  const nx = -Math.sin(a) * l * s.bend * 0.35, ny = Math.cos(a) * l * s.bend * 0.35;
  ctx.beginPath();
  ctx.moveTo(X - dx, Y - dy);
  ctx.quadraticCurveTo(X + nx, Y + ny, X + dx, Y + dy);
  ctx.lineWidth = Math.max(1, s.w * scale);
  ctx.strokeStyle = s.c;
  ctx.stroke();
}

function painting(img: PreparedImage, style: Style, env: Pick<Env, "zone" | "u" | "seed">) {
  const PW = Math.round(env.zone.w * 1.25);
  const key = `monet:${PW}:${style.density}`;
  let p = img.cache.get(key) as { canvas: HTMLCanvasElement; strokes: ReturnType<typeof buildStrokes> } | undefined;
  if (p) return p;
  const strokes = buildStrokes(img, style.density, env.seed);
  const PH = Math.round(PW / img.aspect);
  const c = canvas(PW, PH);
  const g = ctx2d(c);
  g.imageSmoothingQuality = "high";
  g.drawImage(img.blur, 0, 0, PW, PH); // подмалёвок
  g.lineCap = "round";
  g.globalAlpha = 0.9;
  for (const s of strokes.coarse) strokePath(g, s, s.x * PW, s.y * PH, PW);
  g.globalAlpha = 0.85;
  for (const s of strokes.fine) strokePath(g, s, s.x * PW, s.y * PH, PW);
  p = { canvas: c, strokes };
  img.cache.set(key, p);
  return p;
}

export const monet: TechniqueRenderer = {
  prepare(img, style, env: PrepEnv) {
    painting(img, style, env);
  },

  render(ctx, image, style, t, audio: AudioFrame, env) {
    const { W, H, u, pal, zone, frame, scene, seed } = env;
    const motion = style.motion;
    // фон и мягкий свет; источник света переезжает на смене части песни
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    const lights = [[0.82, 0.12], [0.18, 0.3], [0.7, 0.85], [0.3, 0.1]];
    const [lx, ly] = lights[scene.index % lights.length];
    const glow = ctx.createRadialGradient(lx * W, ly * H, 0, lx * W, ly * H, 80 * u);
    glow.addColorStop(0, rgba(pal.byLuma[4], 0.55 + 0.25 * audio.low * motion));
    glow.addColorStop(1, rgba(pal.byLuma[4], 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const inner = drawPassepartout(ctx, zone, pal, u, 3.2);
    // кадр: медленный переход длиной почти во весь интервал между битами
    const fade = Math.min(1.4, Math.max(0.5, frame.interval * 0.9));
    const k = env.poster ? 1 : easeInOut(frame.since / fade);
    const f0 = frameFocus(seed, frame.index - 1, 0.06), f1 = frameFocus(seed, frame.index, 0.06);
    const breath = 1 + 0.012 * Math.sin(t * 0.5) + 0.015 * audio.low * motion;
    const zoom = lerp(f0.zoom, f1.zoom, k) * breath * (1 + 0.04 * (scene.index % 3));
    const fx = lerp(f0.fx, f1.fx, k), fy = lerp(f0.fy, f1.fy, k);

    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    const cur = painting(image, style, env);
    if (k < 1 && env.prev !== image) {
      const pp = painting(env.prev, style, env);
      drawCover(ctx, pp.canvas, pp.canvas.width, pp.canvas.height, inner, zoom, fx, fy);
      ctx.globalAlpha = k;
    }
    const crop = drawCover(ctx, cur.canvas, cur.canvas.width, cur.canvas.height, inner, zoom, fx, fy);
    ctx.globalAlpha = 1;

    // живые мазки: бас удлиняет, высокие частоты качают
    const PW = cur.canvas.width, PH = cur.canvas.height;
    const sx = inner.w / crop.cw;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.75;
    const live = cur.strokes.live;
    for (let i = 0; i < live.length; i++) {
      const s = live[i];
      const X = inner.x + (s.x * PW - crop.cx) * sx, Y = inner.y + (s.y * PH - crop.cy) * sx;
      if (X < inner.x - 10 || X > inner.x + inner.w + 10 || Y < inner.y - 10 || Y > inner.y + inner.h + 10) continue;
      const da = Math.sin(t * 1.3 + i * 1.7) * 0.25 * motion + (audio.high - 0.3) * 0.5 * Math.sin(i * 2.3) * motion;
      const dl = 1 + 0.6 * audio.low * motion + 0.25 * audio.beat;
      strokePath(ctx, s, X, Y, PW * sx, da, dl);
    }
    ctx.globalAlpha = 1;
    // свечение: мягкий свет поверх, дышит с басом
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.16 + 0.22 * audio.low * motion + 0.08 * audio.beat;
    drawCover(ctx, image.blur, image.blur.width, image.blur.height, inner, zoom, fx, fy);
    ctx.restore();
  },

  rules(day) {
    return [
      "Моне: фото пересобрано из мазков, направление мазка идёт вдоль контуров фото",
      `плотность ${day.style.density.toFixed(2)} -> мельче и гуще мазки`,
      "бас удлиняет живые мазки, высокие частоты их покачивают",
      "смена части песни -> свет переходит в другой угол страницы",
    ];
  },
};
