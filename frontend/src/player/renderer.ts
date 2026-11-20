import type { Day, Technique } from "../types";
import type { AudioFrame, Env, Pal, PreparedImage, PrepEnv, TechniqueRenderer } from "./types";
import { monet } from "./techniques/monet";
import { kandinsky } from "./techniques/kandinsky";
import { film } from "./techniques/film";
import { collage } from "./techniques/collage";
import { japanese } from "./techniques/japanese";
import { ensureFonts, loadImage, prepareImage, isDark } from "./prepare";
import { drawConstants, drawWeather, zoneRect } from "./layout";
import { applyAging, applyDevelop, applyGrain, applyPaper } from "./post";
import { changeTimes, frameAt, MAX_DURATION, meanInterval, sceneAt, sections } from "./timeline";
import { inkFor, luma, mixHex } from "../lib/color";
import { ageDays, fadeForAge } from "../lib/date";
import { clamp, lerp, smoothstep } from "../lib/math";
import { hashString } from "../lib/rng";

export const TECH: Record<Technique, TechniqueRenderer> = { monet, kandinsky, film, collage, japanese };

export const DEVELOP_SECONDS = 3;
/** После проявления выцветание уходит до 35% от возрастного: день «вспоминается», но остаётся старым. */
const RESTORED = 0.35;

export function makePalette(palette: string[]): Pal {
  const p = palette.length >= 5 ? palette : [...palette, "#e8e0d2", "#7a6a5a", "#b08060", "#3a3029"].slice(0, 5);
  const bg = p[0];
  const dark = isDark(bg);
  return {
    bg,
    dark,
    ink: inkFor(bg, p),
    mat: dark ? mixHex(bg, "#ffffff", 0.09) : mixHex(bg, "#ffffff", 0.6),
    accents: p.slice(1, 5),
    byLuma: [...p].sort((a, b) => luma(a) - luma(b)),
  };
}

export function weatherOf(day: Day): "rain" | "snow" | null {
  const s = (day.text + " " + day.text_analysis.details.join(" ")).toLowerCase();
  if (/дожд|ливн|ливен|морос|капл/.test(s)) return "rain";
  if (/снег|снеж|метел|вьюг/.test(s)) return "snow";
  return null;
}

export interface DrawOpts {
  poster?: boolean;
  ageDays?: number;
  pageNumber?: number;
  duration?: number;
}

/** Собирает страницу воспоминания: техника -> погода -> бумага -> постоянные элементы -> старение -> зерно -> проявление. */
export class Renderer {
  readonly W: number;
  readonly H: number;
  readonly u: number;
  readonly pal: Pal;
  readonly tech: TechniqueRenderer;
  readonly seed: number;
  images: PreparedImage[] = [];
  private times: number[];
  private interval: number;
  private secs: number[];
  private cache = new Map<string, unknown>();
  private weather: "rain" | "snow" | null;

  constructor(readonly day: Day, W = 720) {
    this.W = W;
    this.H = Math.round((W * 16) / 9);
    this.u = W / 100;
    this.pal = makePalette(day.style.palette);
    this.tech = TECH[day.style.technique] ?? TECH.film;
    this.seed = hashString(day.id);
    this.times = changeTimes(day);
    this.interval = meanInterval(this.times);
    this.secs = sections(day);
    this.weather = weatherOf(day);
  }

  get prepEnv(): PrepEnv {
    return { W: this.W, H: this.H, u: this.u, zone: zoneRect(this.u), pal: this.pal, seed: this.seed, day: this.day };
  }

  async prepare() {
    await ensureFonts();
    const mode = this.day.song?.analysis.mode ?? "major";
    const urls = this.day.photos.length ? this.day.photos : [""];
    const imgs = await Promise.all(urls.map((u) => (u ? loadImage(u) : Promise.resolve(null))));
    this.images = imgs.map((img, i) => prepareImage(`${urls[i]}|${i}`, img, this.day.style, mode, this.pal, this.seed + i));
    for (const img of this.images) this.tech.prepare?.(img, this.day.style, this.prepEnv);
  }

  /** Правила фронта для «Рецепта дня» (дополняют explanation бэка). */
  rules(age = ageDays(this.day.date)): string[] {
    const f = fadeForAge(age);
    const out = [
      `смена кадра каждые ${this.interval.toFixed(2)} с — ровно на биты песни`,
      `${this.secs.length} частей песни -> ${this.secs.length} сцены`,
      `возраст записи ${age} дн. -> выцветание ${Math.round(f * 100)}%; при открытии 3 с проявления, остаётся ${Math.round(f * RESTORED * 100)}%`,
    ];
    if (this.day.text_analysis.details.length) out.push(`${this.day.text_analysis.details.length} детали из текста -> заметки от руки на полях`);
    if (this.weather) out.push(this.weather === "rain" ? "дождь в тексте -> тонкие косые линии дождя" : "снег в тексте -> медленные точки снега");
    if (this.day.song?.analysis.mode === "minor") out.push("минор -> фото дополнительно теряют 25% насыщенности");
    return out.concat(this.tech.rules?.(this.day, this.prepEnv) ?? []);
  }

  draw(ctx: CanvasRenderingContext2D, t: number, audio: AudioFrame, opts: DrawOpts = {}) {
    if (!this.images.length) return;
    const { W, H, u } = this;
    const poster = !!opts.poster;
    const frame = frameAt(this.times, this.interval, t);
    const scene = sceneAt(this.secs, t);
    const n = this.images.length;
    const image = this.images[frame.index % n];
    const prev = this.images[(frame.index - 1 + n) % n];
    const a = this.day.song?.analysis;
    const env: Env = {
      W, H, u,
      day: this.day,
      pal: this.pal,
      images: this.images,
      prev,
      t,
      duration: opts.duration ?? MAX_DURATION,
      frame,
      scene,
      zone: zoneRect(u),
      seed: this.seed,
      energy: a ? (a.energy + this.day.text_analysis.energy) / 2 : this.day.text_analysis.energy,
      poster,
      cache: this.cache,
    };

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    this.tech.render(ctx, image, this.day.style, t, audio, env);
    ctx.restore();
    ctx.save();
    drawWeather(ctx, env, this.weather, t, audio.high);
    applyPaper(ctx, W, H, u);
    drawConstants(ctx, env, { pageNumber: opts.pageNumber });

    const fade = fadeForAge(opts.ageDays ?? ageDays(this.day.date));
    const dev = poster ? 1 : smoothstep(t / DEVELOP_SECONDS);
    const fNow = poster ? fade : lerp(fade, fade * RESTORED, dev);
    applyAging(ctx, W, H, fNow);
    applyGrain(ctx, W, H, clamp(this.day.style.grain * 0.35 + fNow * 0.3), Math.floor(t * 24));
    if (!poster) applyDevelop(ctx, W, H, dev);
    ctx.restore();
  }
}
