import type { AudioFrame, Env, Rect, TechniqueRenderer } from "../types";
import { drawImageCover } from "../layout";
import { adjustHex, mixHex, rgba } from "../../lib/color";
import { lerp } from "../../lib/math";
import { mulberry32 } from "../../lib/rng";

/**
 * КОЛЛАЖ — вырезки Матисса. Радость, много людей, энергичный мажор.
 * Фото рвётся на 3–4 куска с неровным краем, куски лежат с поворотом и тенью,
 * вокруг — плоские вырезки (звёзды, листья, водоросли) из насыщенной палитры, танцуют под бас.
 * На каждой смене кадра один кусок меняет фото и «подпрыгивает». Яркие рваные пятна = шум и движение.
 */
type P = [number, number];
interface Piece { poly: P[]; rect: Rect; rot: number; dx: number; dy: number }
interface Cut { pts: P[]; x: number; y: number; s: number; rot: number; c: string; ph: number; front: boolean }

function torn(r: () => number, rc: Rect, u: number): P[] {
  const pts: P[] = [];
  const corners: P[] = [[rc.x, rc.y], [rc.x + rc.w, rc.y], [rc.x + rc.w, rc.y + rc.h], [rc.x, rc.y + rc.h]];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
    const n = 10 + Math.floor(r() * 6);
    for (let j = 0; j < n; j++) {
      const k = j / n;
      const jit = j === 0 ? 0.4 : 1.1;
      pts.push([lerp(ax, bx, k) + (r() - 0.5) * jit * u, lerp(ay, by, k) + (r() - 0.5) * jit * u]);
    }
  }
  return pts;
}

function pieces(env: Env, sceneIdx: number): Piece[] {
  const key = `col:p:${sceneIdx}`;
  const c = env.cache.get(key) as Piece[] | undefined;
  if (c) return c;
  const { zone: z, u } = env;
  const r = mulberry32(env.seed + 900 + sceneIdx * 31);
  const n = Math.min(4, Math.max(3, env.images.length + 1));
  // гильотинная нарезка фото-зоны
  let rects: Rect[] = [{ ...z }];
  while (rects.length < n) {
    rects.sort((a, b) => b.w * b.h - a.w * a.h);
    const big = rects.shift()!;
    const k = 0.38 + r() * 0.24;
    if (big.h > big.w * 0.9) rects.push({ ...big, h: big.h * k }, { ...big, y: big.y + big.h * k, h: big.h * (1 - k) });
    else rects.push({ ...big, w: big.w * k }, { ...big, x: big.x + big.w * k, w: big.w * (1 - k) });
  }
  const out = rects.map((rc) => {
    const g = 1.2 * u;
    const rr = { x: rc.x + g, y: rc.y + g, w: rc.w - 2 * g, h: rc.h - 2 * g };
    return { poly: torn(r, rr, u), rect: rr, rot: (r() - 0.5) * 0.09, dx: (r() - 0.5) * 3 * u, dy: (r() - 0.5) * 3 * u };
  });
  env.cache.set(key, out);
  return out;
}

function cutShape(r: () => number, R: number): P[] {
  const kind = r();
  const pts: P[] = [];
  const N = 72;
  const k = 4 + Math.floor(r() * 5), ph = r() * 6.28;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let rad: number;
    if (kind < 0.4) rad = R * (0.62 + 0.38 * Math.sin(k * a + ph)); // звезда-цветок
    else if (kind < 0.75) rad = R * (0.3 + 0.7 * Math.pow(Math.abs(Math.cos(a)), 0.7)) * (1 + 0.2 * Math.sin(9 * a + ph)); // лист-водоросль
    else rad = R * (0.85 + 0.15 * Math.sin(3 * a + ph) + 0.08 * Math.sin(7 * a)); // клякса
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return pts;
}

function cuts(env: Env, sceneIdx: number): Cut[] {
  const key = `col:c:${sceneIdx}`;
  const c = env.cache.get(key) as Cut[] | undefined;
  if (c) return c;
  const { u, pal, zone: z, day } = env;
  const r = mulberry32(env.seed + 77 + sceneIdx * 53);
  const n = Math.round(5 + day.style.density * 8);
  const vivid = pal.accents.map((a) => adjustHex(a, { s: 0.18 }));
  const out: Cut[] = [];
  for (let i = 0; i < n; i++) {
    // по краям фото-зоны, чтобы не закрывать лица
    const edge = r();
    const x = edge < 0.5 ? z.x + (r() < 0.5 ? 0 : z.w) + (r() - 0.5) * 14 * u : z.x + r() * z.w;
    const y = edge < 0.5 ? z.y + r() * z.h : z.y + (r() < 0.5 ? 0 : z.h) + (r() - 0.5) * 12 * u;
    out.push({ pts: cutShape(r, (4 + r() * 7) * u), x, y, s: 1, rot: r() * 6.28, c: vivid[i % vivid.length], ph: r() * 6.28, front: r() < 0.45 });
  }
  env.cache.set(key, out);
  return out;
}

function smoothPath(ctx: CanvasRenderingContext2D, pts: P[]) {
  ctx.beginPath();
  const n = pts.length;
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = mid(pts[n - 1], pts[0]);
  ctx.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

function polyPath(ctx: CanvasRenderingContext2D, pts: P[], shrink = 0, cx = 0, cy = 0) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const px = x + (cx - x) * shrink, py = y + (cy - y) * shrink;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.closePath();
}

export const collage: TechniqueRenderer = {
  render(ctx, _image, style, t, audio: AudioFrame, env) {
    const { W, H, u, pal, zone, frame, scene, images } = env;
    const m = style.motion;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    // лист-подложка (паспарту коллажа)
    ctx.fillStyle = rgba("#000000", 0.08);
    ctx.fillRect(zone.x + 0.6 * u, zone.y + 0.9 * u, zone.w, zone.h);
    ctx.fillStyle = mixHex(pal.mat, pal.bg, 0.3);
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

    const cs = cuts(env, scene.index);
    const drawCut = (c: Cut, i: number) => {
      const sway = Math.sin(t * 0.9 + c.ph) * 0.12 * m + audio.high * 0.05 * Math.sin(c.ph);
      const sc = 1 + 0.1 * audio.beat * m + 0.06 * audio.low * m;
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(t * 1.2 + i) * 0.6 * u * m);
      ctx.rotate(c.rot + sway);
      ctx.scale(sc, sc);
      ctx.translate(0.5 * u, 0.7 * u);
      smoothPath(ctx, c.pts);
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fill();
      ctx.translate(-0.5 * u, -0.7 * u);
      smoothPath(ctx, c.pts);
      ctx.fillStyle = c.c;
      ctx.fill();
      ctx.restore();
    };
    cs.forEach((c, i) => !c.front && drawCut(c, i));

    // куски фото
    const ps = pieces(env, scene.index);
    ps.forEach((p, i) => {
      const img = images[(i + frame.index) % images.length];
      const isNew = !env.poster && i === frame.index % ps.length && frame.since < 0.35;
      const pop = isNew ? 1 + 0.06 * (1 - frame.since / 0.35) : 1;
      const cx = p.rect.x + p.rect.w / 2, cy = p.rect.y + p.rect.h / 2;
      ctx.save();
      ctx.translate(cx + p.dx, cy + p.dy);
      ctx.rotate(p.rot + Math.sin(t * 0.7 + i) * 0.01 * m);
      ctx.scale(pop, pop);
      ctx.translate(-cx, -cy);
      ctx.translate(0.6 * u, 0.9 * u);
      polyPath(ctx, p.poly);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fill();
      ctx.translate(-0.6 * u, -0.9 * u);
      polyPath(ctx, p.poly);
      ctx.fillStyle = "#fbf8f1"; // белый рваный край бумаги
      ctx.fill();
      polyPath(ctx, p.poly, 0.035, cx, cy);
      ctx.clip();
      drawImageCover(ctx, img, zone, 1.03, 0.5, 0.45);
      ctx.restore();
    });

    cs.forEach((c, i) => c.front && drawCut(c, i));
  },

  rules(day) {
    const n = Math.round(5 + day.style.density * 8);
    return [
      "Коллаж: фото порвано на куски с белым краем, вокруг вырезки в духе Матисса",
      `плотность ${day.style.density.toFixed(2)} -> ${n} цветных вырезок, палитра насыщеннее на 18%`,
      `${day.photos.length} фото -> ${Math.min(4, Math.max(3, day.photos.length + 1))} куска коллажа`,
      "смена кадра -> один кусок меняет фото и подпрыгивает; бас раскачивает вырезки",
      "смена части песни -> коллаж пересобирается заново",
    ];
  },
};
