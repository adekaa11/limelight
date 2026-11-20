import mockDays from "./mocks/days.json";
import type { Day, NewDayInput, StylePreviewIn, StylePreviewOut } from "./types";

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
/** Моки, если бэкенд не задан или явно включён VITE_USE_MOCK=true. */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true" || !API;

// Дни, созданные в мок-режиме (живут до перезагрузки: фото — blob-ссылки).
const sessionDays: Day[] = [];
const byDateDesc = (a: Day, b: Day) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

// ---------------- состояние сервера ----------------
// Бесплатный Render засыпает после простоя: первый запрос ждёт ~50 с. UI показывает это честно.
export type ServerState = "unknown" | "waking" | "ready" | "down";
let server: ServerState = USE_MOCK ? "ready" : "unknown";
const listeners = new Set<(s: ServerState) => void>();
const setServer = (s: ServerState) => {
  if (s === server) return;
  server = s;
  listeners.forEach((l) => l(s));
};
export const getServerState = () => server;
export const onServerState = (l: (s: ServerState) => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function humanError(status: number, detail: unknown): string {
  if (status === 404) return "404";
  if (status === 413) return "Файл слишком большой: фото и песня — до 20 МБ";
  if (status === 415) return "Этот тип файла не подходит: нужны фото (jpg, png, webp, heic) и аудио (mp3, m4a, wav)";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d))).join("; ");
  return `Ошибка сервера (${status})`;
}

async function readError(r: Response) {
  try {
    const j = await r.json();
    return humanError(r.status, j.detail ?? j);
  } catch {
    return humanError(r.status, null);
  }
}

/** GET с ожиданием пробуждения сервера и повтором на 502/503/504 и сетевых ошибках. */
async function get<T>(path: string): Promise<T> {
  const slow = setTimeout(() => server !== "ready" && setServer("waking"), 2500);
  try {
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const kill = setTimeout(() => ctrl.abort(), 90_000);
      try {
        const r = await fetch(API + path, { signal: ctrl.signal });
        if ([502, 503, 504].includes(r.status) && attempt < 4) {
          setServer("waking");
          await sleep(4000);
          continue;
        }
        setServer("ready");
        if (!r.ok) throw new ApiError(r.status, await readError(r));
        return (await r.json()) as T;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (attempt >= 3) {
          setServer("down");
          throw new Error("Сервер не отвечает. Проверьте интернет и попробуйте ещё раз через минуту.");
        }
        setServer("waking");
        await sleep(3000);
      } finally {
        clearTimeout(kill);
      }
    }
  } finally {
    clearTimeout(slow);
  }
}

let warm: Promise<boolean> | null = null;
/** Разбудить сервер заранее (например, пока человек пишет о дне). */
export function warmUp(): Promise<boolean> {
  if (USE_MOCK) return Promise.resolve(true);
  if (!warm || server === "down") {
    warm = get<{ ok: boolean }>("/api/health").then(
      (r) => !!r.ok,
      () => {
        warm = null;
        return false;
      },
    );
  }
  return warm;
}

// ---------------- дни ----------------
let listCache: Promise<Day[]> | null = null;

export async function listDays(fresh = false): Promise<Day[]> {
  if (USE_MOCK) return [...sessionDays, ...(mockDays as Day[])].sort(byDateDesc);
  if (!listCache || fresh) {
    listCache = get<Day[]>("/api/days");
    listCache.catch(() => (listCache = null));
  }
  return listCache;
}

export async function getDay(id: string): Promise<Day> {
  if (USE_MOCK) {
    const d = [...sessionDays, ...(mockDays as Day[])].find((x) => x.id === id);
    if (!d) throw new Error("404");
    return d;
  }
  if (listCache) {
    const hit = (await listCache.catch(() => [] as Day[])).find((d) => d.id === id);
    if (hit) return hit;
  }
  return get<Day>(`/api/days/${id}`);
}

export interface CreateProgress {
  /** 0..1 — сколько байт фото и песни уже ушло на сервер */
  upload: number;
  /** всё загружено, сервер анализирует */
  processing: boolean;
}

/** Создание дня. XHR, а не fetch — ради реального прогресса загрузки файлов. */
export async function createDay(input: NewDayInput, onProgress?: (p: CreateProgress) => void): Promise<Day> {
  if (USE_MOCK) return mockCreate(input, onProgress);
  const fd = new FormData();
  fd.append("text", input.text);
  input.photos.forEach((p) => fd.append("photos", p));
  if (input.song_url) fd.append("song_url", input.song_url);
  if (input.song_file) fd.append("song_file", input.song_file);
  if (input.date) fd.append("date", input.date);
  const day = await new Promise<Day>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API + "/api/days");
    xhr.timeout = 300_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.({ upload: e.loaded / e.total, processing: false });
    xhr.upload.onload = () => onProgress?.({ upload: 1, processing: true });
    xhr.onload = () => {
      setServer("ready");
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* не JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Day);
      else reject(new ApiError(xhr.status, humanError(xhr.status, (body as { detail?: unknown } | null)?.detail ?? null)));
    };
    xhr.onerror = () => reject(new Error("Связь с сервером оборвалась. Ничего не потерялось — нажмите «Попробовать ещё раз»."));
    xhr.ontimeout = () => reject(new Error("Сервер думает слишком долго. Попробуйте ещё раз — второй запуск обычно быстрее."));
    xhr.send(fd);
  });
  listCache = null;
  return day;
}

export const zipUrl = (id: string) => (USE_MOCK ? null : `${API}/api/days/${id}/zip`);

export async function uploadMemory(id: string, video: Blob): Promise<Day | null> {
  if (USE_MOCK) return null;
  const fd = new FormData();
  fd.append("file", video, "memory.webm");
  const r = await fetch(`${API}/api/days/${id}/memory`, { method: "PUT", body: fd });
  if (!r.ok) throw new ApiError(r.status, await readError(r));
  listCache = null;
  return r.json();
}

/** Для /lab: пересчитать стиль по правилам бэка. В мок-режиме недоступно. */
export async function previewStyle(body: StylePreviewIn): Promise<StylePreviewOut | null> {
  if (USE_MOCK) return null;
  const r = await fetch(API + "/api/style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new ApiError(r.status, await readError(r));
  return r.json();
}

// --- мок создания дня: берём ближайший по словам мок как «стиль», подставляем ввод пользователя
async function mockCreate(input: NewDayInput, onProgress?: (p: CreateProgress) => void): Promise<Day> {
  for (let i = 1; i <= 10; i++) {
    await sleep(80);
    onProgress?.({ upload: i / 10, processing: false });
  }
  onProgress?.({ upload: 1, processing: true });
  await sleep(4000);
  const t = input.text.toLowerCase();
  const keys: [RegExp, number][] = [
    [/офис|работ|дедлайн|релиз|ночь|сдач/, 1],
    [/дожд|тишин|один|окн|снег|туман/, 2],
    [/друз|смех|праздник|лето|дач|танц/, 3],
    [/бабуш|детств|старое|помню|ностальг/, 4],
  ];
  const all = mockDays as Day[];
  const base = all[keys.find(([re]) => re.test(t))?.[1] ?? 0];
  const photos = input.photos.map((f) => URL.createObjectURL(f));
  const firstSentence = input.text.split(/[.!?\n]/)[0].trim();
  const day: Day = {
    ...structuredClone(base),
    id: `local-${Date.now()}`,
    date: input.date || new Date().toISOString().slice(0, 10),
    text: input.text,
    title: firstSentence.split(/\s+/).slice(0, 5).join(" ") || base.title,
    photos: photos.length ? photos : base.photos,
    meta: { llm: "mock", song_source: "mock" },
  };
  if (input.song_file && day.song) day.song = { ...day.song, title: input.song_file.name, preview_url: URL.createObjectURL(input.song_file) };
  day.explanation = ["[мок-режим] стиль взят из ближайшего примера, бэкенд не подключён", ...day.explanation];
  sessionDays.unshift(day);
  return day;
}
