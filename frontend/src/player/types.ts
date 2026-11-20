import type { Day, Style } from "../types";

/** Звук в текущий момент: полосы спектра (WebAudio AnalyserNode) и огибающая бита (librosa beats). */
export interface AudioFrame {
  low: number; // 30–180 Гц: пульс
  mid: number;
  high: number; // 4–11 кГц: лёгкое дрожание
  level: number;
  beat: number; // 1 в момент бита, затухает к 0
}
export const SILENT: AudioFrame = { low: 0, mid: 0, high: 0, level: 0, beat: 0 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreparedImage {
  key: string;
  graded: HTMLCanvasElement; // фото, приведённое к палитре дня
  blur: HTMLCanvasElement; // размытая копия для свечения
  w: number;
  h: number;
  aspect: number; // w / h
  cache: Map<string, unknown>; // кэши техник (мазки Моне и т. п.)
}

export interface Pal {
  bg: string;
  ink: string;
  mat: string; // цвет паспарту
  accents: string[]; // palette[1..4]
  byLuma: string[]; // все 5 цветов от тёмного к светлому
  dark: boolean;
}

export interface Env {
  W: number;
  H: number;
  u: number; // 1% ширины
  day: Day;
  pal: Pal;
  images: PreparedImage[];
  prev: PreparedImage; // кадр до последней смены
  t: number;
  duration: number;
  frame: { index: number; since: number; interval: number }; // смена кадра по битам
  scene: { index: number; since: number; count: number }; // смена сцены по частям песни
  zone: Rect; // фото-зона постоянной сетки
  seed: number;
  energy: number;
  poster: boolean; // статичный кадр для архива
  cache: Map<string, unknown>;
}

export type PrepEnv = Pick<Env, "W" | "H" | "u" | "zone" | "pal" | "seed" | "day">;

/** Общий интерфейс техник: render(ctx, image, style, t, audio) + окружение. */
export interface TechniqueRenderer {
  prepare?(img: PreparedImage, style: Style, env: PrepEnv): void;
  render(ctx: CanvasRenderingContext2D, image: PreparedImage, style: Style, t: number, audio: AudioFrame, env: Env): void;
  /** Правила, которые техника добавляет к «Рецепту дня». */
  rules?(day: Day, env: PrepEnv): string[];
}
