import type { AudioFrame, TechniqueRenderer } from "../types";
import { drawImageCover, drawPassepartout, frameFocus } from "../layout";
import { luma, mixHex, rgba } from "../../lib/color";
import { clamp, easeInOut, easeOut, lerp } from "../../lib/math";

/**
 * МА (японский минимализм) — тишина, одиночество, дождь, медленный минор.
 * Много пустоты, маленькое фото в тонком паспарту на одной из третей, плоское поле цвета
 * и одна тонкая линия-горизонт, которая медленно прочерчивается. Пустое пространство даёт тишине место.
 * Переходы долгие, движение почти незаметно — только дыхание.
 */
const SPOTS = [
  { x: 0.5, y: 0.36, field: "ground" },
  { x: 0.34, y: 0.3, field: "column" },
  { x: 0.62, y: 0.44, field: "sun" },
] as const;

export const japanese: TechniqueRenderer = {
  render(ctx, image, style, t, audio: AudioFrame, env) {
    const { W, H, u, pal, zone, frame, scene, seed } = env;
    const m = style.motion;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // плоское поле цвета: самый «тихий» акцент (ближе всего к фону по светлоте, но различимый)
    const field = [...pal.accents].sort((a, b) => Math.abs(luma(a) - luma(pal.bg) - 0.18) - Math.abs(luma(b) - luma(pal.bg) - 0.18))[0];
    const spot = SPOTS[scene.index % SPOTS.length];
    const sk = env.poster ? 1 : easeInOut(scene.since / 1.8);
    const prevSpot = SPOTS[(scene.index + SPOTS.length - 1) % SPOTS.length];
    ctx.fillStyle = mixHex(field, pal.bg, 0.15);
    const drawField = (kind: string, a: number) => {
      ctx.globalAlpha = a;
      if (kind === "ground") ctx.fillRect(0, zone.y + zone.h * 0.62, W, H - (zone.y + zone.h * 0.62));
      else if (kind === "column") ctx.fillRect(W * 0.64, 0, W * 0.36, H);
      else {
        ctx.beginPath();
        ctx.arc(zone.x + zone.w * 0.3, zone.y + zone.h * 0.3, 21 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    if (sk < 1 && scene.index > 0) drawField(prevSpot.field, 1 - sk);
    drawField(spot.field, scene.index > 0 ? sk : 1);
    ctx.globalAlpha = 1;

    // одна тонкая линия
    const ly = zone.y + zone.h * 0.62;
    const lk = env.poster ? 1 : easeOut(clamp((t - 0.6) / 5));
    ctx.strokeStyle = rgba(pal.ink, 0.7);
    ctx.lineWidth = Math.max(1, 0.18 * u);
    ctx.beginPath();
    const wob = audio.high * 0.25 * u * m;
    ctx.moveTo(GRID_X(u), ly);
    ctx.quadraticCurveTo(W / 2, ly + wob, GRID_X(u) + (W - 2 * GRID_X(u)) * lk, ly);
    ctx.stroke();

    // маленькое фото на трети
    const pw = zone.w * 0.46;
    const ph = pw * 1.25;
    const px = lerp(prevSpot.x, spot.x, scene.index > 0 ? sk : 1), py = lerp(prevSpot.y, spot.y, scene.index > 0 ? sk : 1);
    const breath = 1 + 0.008 * Math.sin(t * 0.6) + 0.006 * audio.low * m;
    const w = pw * breath, h = ph * breath;
    const rect = { x: zone.x + zone.w * px - w / 2, y: zone.y + zone.h * py - h / 2, w, h };
    const inner = drawPassepartout(ctx, rect, pal, u, 1.4);
    const fade = Math.max(1.2, frame.interval * 0.95);
    const k = env.poster ? 1 : easeInOut(frame.since / fade);
    const ff = frameFocus(seed, frame.index, 0.04);
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    if (k < 1 && env.prev !== image) {
      drawImageCover(ctx, env.prev, inner, ff.zoom, ff.fx, ff.fy);
      ctx.globalAlpha = k;
    }
    drawImageCover(ctx, image, inner, ff.zoom, ff.fx, ff.fy);
    ctx.restore();

    // печать-акцент: маленький квадрат самым ярким цветом
    ctx.fillStyle = pal.accents.reduce((a, b) => (Math.abs(luma(b) - 0.45) < Math.abs(luma(a) - 0.45) ? b : a));
    ctx.globalAlpha = 0.85;
    ctx.fillRect(rect.x + rect.w + 1.6 * u, rect.y + rect.h - 3.2 * u, 2.4 * u, 2.4 * u);
    ctx.globalAlpha = 1;
  },

  rules(day) {
    return [
      "Ма: фото занимает меньше половины ширины, остальное — пустота и плоский цвет",
      "одна тонкая линия-горизонт прочерчивается за 5 секунд",
      "смена кадра -> долгое растворение (не меньше 1.2 с), смена части песни -> фото переходит на другую треть",
      `минор/тишина -> движение почти незаметно (motion ${day.style.motion.toFixed(2)})`,
    ];
  },
};

const GRID_X = (u: number) => 6 * u;
