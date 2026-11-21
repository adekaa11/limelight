import type { AudioFrame, TechniqueRenderer } from "../types";
import { drawImageCover, drawPassepartout, frameFocus } from "../layout";
import { applyGrain } from "../post";
import { mixHex, rgba } from "../../lib/color";
import { clamp, easeInOut, lerp } from "../../lib/math";
import { mulberry32 } from "../../lib/rng";

/**
 * ПЛЁНКА — ностальгия, старые песни, минор.
 * Плёночный отпечаток: усиленное зерно внутри кадра, виньетка, тёплые засветы по краю,
 * «дрожание кадра» в проекторе, пыль и царапины, вспышка-передержка на склейке.
 * Зерно и выцветание считываются как «это было давно».
 */
export const film: TechniqueRenderer = {
  render(ctx, image, style, t, audio: AudioFrame, env) {
    const { W, H, u, pal, zone, frame, scene, seed } = env;
    const m = style.motion;
    const fno = Math.floor(t * 24);
    const r = mulberry32(seed + fno);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // отпечаток: светлое поле, как у фотобумаги, + подпись по краю
    const inner = drawPassepartout(ctx, zone, pal, u, 3.6, mixHex(pal.mat, "#fbf6ea", pal.dark ? 0.15 : 0.5));
    ctx.save();
    ctx.font = `500 ${1.9 * u}px Inter, sans-serif`;
    ctx.fillStyle = rgba(mixHex(pal.accents[0], "#c0622b", 0.5), 0.75);
    ctx.fillText(`LIMELIGHT 400   ${String((frame.index % 36) + 1).padStart(2, "0")}A   ▸`, inner.x, inner.y + inner.h + 2.4 * u);
    ctx.restore();

    // кадр с дрожанием (gate weave) и медленным наездом
    const weave = env.poster ? 0 : m * 0.45 * u;
    const jx = (r() - 0.5) * weave + Math.sin(t * 1.7) * weave * 0.5;
    const jy = (r() - 0.5) * weave * 1.4;
    const fade = Math.min(0.5, frame.interval * 0.5);
    const k = env.poster ? 1 : easeInOut(frame.since / fade);
    const f0 = frameFocus(seed, frame.index - 1, 0.07), f1 = frameFocus(seed, frame.index, 0.07);
    const zoom = lerp(f0.zoom, f1.zoom, k) * (1 + 0.02 * Math.sin(t * 0.3));
    const fx = lerp(f0.fx, f1.fx, k), fy = lerp(f0.fy, f1.fy, k);
    const box = { x: inner.x + jx, y: inner.y + jy, w: inner.w, h: inner.h };

    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    if (k < 1 && env.prev !== image) {
      drawImageCover(ctx, env.prev, box, zoom, fx, fy);
      ctx.globalAlpha = k;
    }
    drawImageCover(ctx, image, box, zoom, fx, fy);
    ctx.globalAlpha = 1;

    // мерцание проектора
    const flick = env.poster ? 0 : (r() - 0.5) * 0.08 + audio.high * 0.04;
    if (flick > 0) {
      ctx.fillStyle = `rgba(255,248,230,${flick})`;
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
    // передержка на склейке
    if (!env.poster && frame.since < 0.25) {
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255,236,200,${0.45 * (1 - frame.since / 0.25)})`;
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      ctx.globalCompositeOperation = "source-over";
    }

    // засветы: тёплые пятна у края, своё место на каждой части песни, ярче с басом
    const leak = mixHex("#ff7a2e", pal.accents[0], 0.25);
    const rs = mulberry32(seed + scene.index * 7);
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 2; i++) {
      const side = rs() < 0.5 ? 0 : 1;
      const lx = inner.x + side * inner.w + Math.sin(t * 0.4 + i) * 6 * u;
      const ly = inner.y + (0.15 + rs() * 0.7) * inner.h + Math.cos(t * 0.3 + i) * 8 * u;
      const rad = (28 + rs() * 22) * u;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, rad);
      const a = clamp(0.28 + 0.3 * audio.low * m + (env.poster ? 0.1 : 0));
      g.addColorStop(0, rgba(i ? "#ff3d5a" : leak, a));
      g.addColorStop(1, rgba(leak, 0));
      ctx.fillStyle = g;
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
    ctx.globalCompositeOperation = "source-over";

    // виньетка
    const vg = ctx.createRadialGradient(inner.x + inner.w / 2, inner.y + inner.h / 2, inner.w * 0.35, inner.x + inner.w / 2, inner.y + inner.h / 2, inner.h * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(20,10,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

    // пыль и царапины
    ctx.fillStyle = "rgba(20,15,10,0.6)";
    ctx.strokeStyle = "rgba(255,250,240,0.35)";
    const specks = env.poster ? 6 : Math.floor(r() * 7);
    for (let i = 0; i < specks; i++) {
      ctx.beginPath();
      ctx.arc(inner.x + r() * inner.w, inner.y + r() * inner.h, (0.15 + r() * 0.35) * u, 0, Math.PI * 2);
      ctx.fill();
    }
    if (r() < 0.35 || env.poster) {
      const x = inner.x + r() * inner.w;
      ctx.lineWidth = Math.max(1, 0.12 * u);
      ctx.beginPath();
      ctx.moveTo(x, inner.y);
      ctx.lineTo(x + (r() - 0.5) * 2 * u, inner.y + inner.h);
      ctx.stroke();
    }
    ctx.restore();

    // плёночное зерно внутри кадра — сильнее общего
    applyGrain(ctx, W, H, clamp(style.grain * 0.9 + 0.15), fno, inner);
    void H;
  },

  rules(day) {
    return [
      "Плёнка: фото как отпечаток, усиленное зерно внутри кадра, виньетка, пыль",
      `зерно ${day.style.grain.toFixed(2)} (чем старше песня, тем больше)`,
      "смена кадра -> вспышка-передержка, как на склейке плёнки",
      "бас -> ярче тёплые засветы; смена части песни -> засветы переходят на другой край",
    ];
  },
};
