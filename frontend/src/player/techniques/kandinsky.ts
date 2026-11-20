import type { AudioFrame, Env, Rect, TechniqueRenderer } from "../types";
import { drawImageCover, drawPassepartout, frameFocus } from "../layout";
import { rgba } from "../../lib/color";
import { clamp, easeOut } from "../../lib/math";
import { mulberry32 } from "../../lib/rng";

/**
 * КАНДИНСКИЙ — геометрия. Напряжённые дни, работа, быстрая электроника.
 * Жёсткая сетка 12 колонок, фото режется по сетке, поверх — круги, кольца, треугольники и пучки линий
 * из палитры. Резкие склейки на биты (без плавных переходов), круги пульсируют с басом,
 * одна фигура перескакивает в новую клетку на каждой смене кадра. Сетка и геометрия = ритм и собранность.
 */
type Kind = "circle" | "rings" | "tri" | "lines" | "semi" | "checker" | "bar";
interface Shape { kind: Kind; cx: number; cy: number; r: number; rot: number; c: string; c2: string; ph: number }

const COLS = 12;

function shapes(env: Env, sceneIdx: number): Shape[] {
  const key = `kand:${sceneIdx}`;
  const cached = env.cache.get(key) as Shape[] | undefined;
  if (cached) return cached;
  const { u, pal, day } = env;
  const r = mulberry32(env.seed + sceneIdx * 101);
  const n = Math.round(6 + day.style.density * 10);
  const kinds: Kind[] = ["circle", "rings", "tri", "lines", "semi", "checker", "bar", "circle"];
  const cell = (88 * u) / COLS;
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const kind = i === 0 ? "circle" : kinds[Math.floor(r() * kinds.length)];
    out.push({
      kind,
      cx: (6 + Math.round(r() * COLS) * (88 / COLS)) * u,
      cy: (29 + Math.round(r() * 14) * (cell / u)) * u, // только в фото-зоне: текст не перекрываем
      r: (i === 0 ? 2.2 + r() * 1.2 : 0.6 + r() * 1.6) * cell,
      rot: Math.round(r() * 8) * (Math.PI / 8),
      c: pal.accents[i % pal.accents.length],
      c2: pal.accents[(i + 2) % pal.accents.length],
      ph: r() * Math.PI * 2,
    });
  }
  env.cache.set(key, out);
  return out;
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, scale: number, u: number, ink: string, high: number) {
  ctx.save();
  ctx.translate(s.cx, s.cy);
  ctx.rotate(s.rot + high * 0.06 * Math.sin(s.ph));
  const R = s.r * scale;
  ctx.fillStyle = s.c;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, 0.35 * u);
  switch (s.kind) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.c2;
      ctx.beginPath();
      ctx.arc(R * 0.18, -R * 0.12, R * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "rings":
      for (let i = 3; i >= 1; i--) {
        ctx.fillStyle = i % 2 ? s.c : s.c2;
        ctx.beginPath();
        ctx.arc(0, 0, (R * i) / 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "tri":
      ctx.beginPath();
      ctx.moveTo(0, -R);
      ctx.lineTo(R * 0.9, R * 0.7);
      ctx.lineTo(-R * 0.9, R * 0.7);
      ctx.closePath();
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      break;
    case "lines":
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-R * 2.2, i * 0.9 * u);
        ctx.lineTo(R * 2.2, i * 0.9 * u + i * 0.6 * u);
        ctx.stroke();
      }
      break;
    case "semi":
      ctx.beginPath();
      ctx.arc(0, 0, R, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case "checker": {
      const c = R / 2;
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
          ctx.fillStyle = (x + y) % 2 ? s.c : ink;
          ctx.fillRect(-R * 0.75 + x * c, -R * 0.75 + y * c, c, c);
        }
      break;
    }
    case "bar":
      ctx.fillRect(-R * 2, -0.6 * u, R * 4, 1.2 * u);
      ctx.fillStyle = s.c2;
      ctx.fillRect(-R * 2, 1.2 * u, R * 1.4, 1.2 * u);
      break;
  }
  ctx.restore();
}

export const kandinsky: TechniqueRenderer = {
  render(ctx, image, style, t, audio: AudioFrame, env) {
    const { W, H, u, pal, zone, frame, scene, seed } = env;
    const m = style.motion;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // жёсткая сетка
    const cell = zone.w / COLS;
    ctx.strokeStyle = rgba(pal.ink, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= COLS; i++) {
      ctx.moveTo(zone.x + i * cell, 0);
      ctx.lineTo(zone.x + i * cell, H);
    }
    for (let y = zone.y % cell; y < H; y += cell) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();

    // геометрия живёт между названием и подписью: постоянные элементы всегда читаются
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, zone.y - 3 * u, W, zone.h + 27 * u);
    ctx.clip();

    // несущие диагонали
    const r = mulberry32(seed + scene.index * 13);
    ctx.lineCap = "butt";
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 0 ? pal.ink : pal.accents[(i + 1) % pal.accents.length];
      ctx.lineWidth = (0.4 + r() * 1.1) * u * (1 + audio.high * 0.4 * m);
      const grow = env.poster ? 1 : easeOut(scene.since / 0.6);
      const x0 = r() * W, y0 = (0.15 + r() * 0.3) * H, x1 = r() * W, y1 = (0.6 + r() * 0.35) * H;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (x1 - x0) * grow, y0 + (y1 - y0) * grow);
      ctx.stroke();
    }

    // фото по сетке: на каждой части песни — своё положение
    const variants: Rect[] = [
      zone,
      { x: zone.x, y: zone.y + 3 * cell, w: 8 * cell, h: zone.h - 5 * cell },
      { x: zone.x + 4 * cell, y: zone.y, w: 8 * cell, h: zone.h - 3 * cell },
    ];
    const pr = variants[scene.index % variants.length];
    const inner = drawPassepartout(ctx, pr, pal, u, 1.6);
    const ff = frameFocus(seed, frame.index, 0.18);
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    const glitch = !env.poster && frame.since < 0.14;
    if (glitch) {
      // резкая склейка: кадр на мгновение режется на полосы
      const strips = 5;
      for (let i = 0; i < strips; i++) {
        const sh = inner.h / strips;
        ctx.save();
        ctx.beginPath();
        ctx.rect(inner.x, inner.y + i * sh, inner.w, sh);
        ctx.clip();
        const dx = (i % 2 ? 1 : -1) * 2.2 * u * m * (1 - frame.since / 0.14);
        drawImageCover(ctx, image, { ...inner, x: inner.x + dx }, ff.zoom, ff.fx, ff.fy);
        ctx.restore();
      }
    } else drawImageCover(ctx, image, inner, ff.zoom, ff.fx, ff.fy);
    ctx.restore();

    // геометрия: пульс с басом и битом; одна фигура прыгает на каждой смене кадра
    const list = shapes(env, scene.index);
    const jumpR = mulberry32(seed + frame.index * 17);
    ctx.globalCompositeOperation = pal.dark ? "screen" : "multiply";
    list.forEach((s, i) => {
      let sh = s;
      if (i === frame.index % list.length && !env.poster) {
        sh = { ...s, cx: (6 + Math.round(jumpR() * COLS) * (88 / COLS)) * u, rot: s.rot + Math.PI / 4 };
      }
      const scale = 1 + (0.22 * audio.beat + 0.14 * audio.low) * m * (s.kind === "circle" || s.kind === "rings" ? 1 : 0.4);
      ctx.globalAlpha = s.kind === "lines" ? 0.9 : 0.85;
      drawShape(ctx, sh, scale, u, pal.ink, audio.high);
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.restore();

    // точка-акцент на бите
    if (audio.beat > 0.05) {
      ctx.fillStyle = rgba(pal.accents[0], clamp(audio.beat));
      ctx.beginPath();
      ctx.arc(zone.x + zone.w - 2 * cell, zone.y - 1.5 * u, (1 + audio.beat) * u, 0, Math.PI * 2);
      ctx.fill();
    }
    void t;
  },

  rules(day) {
    const n = Math.round(6 + day.style.density * 10);
    return [
      "Кандинский: жёсткая сетка из 12 колонок, фото и фигуры привязаны к ней",
      `плотность ${day.style.density.toFixed(2)} -> ${n} геометрических фигур`,
      "смена кадра -> резкая склейка и прыжок одной фигуры (без плавных переходов)",
      "бас и бит -> пульс кругов, высокие частоты -> толщина линий",
      "смена части песни -> фото переезжает в другую клетку сетки",
    ];
  },
};
