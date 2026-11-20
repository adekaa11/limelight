import mockDays from "./mocks/days.json";
import type { Day, NewDayInput, StylePreviewIn, StylePreviewOut } from "./types";

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
/** Моки, если бэкенд не задан или явно включён VITE_USE_MOCK=true. */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true" || !API;

// Дни, созданные в мок-режиме (живут до перезагрузки: фото — blob-ссылки).
const sessionDays: Day[] = [];
const byDateDesc = (a: Day, b: Day) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, init);
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const j = await r.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {
      /* тело не JSON */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export async function listDays(): Promise<Day[]> {
  if (USE_MOCK) return [...sessionDays, ...(mockDays as Day[])].sort(byDateDesc);
  return http<Day[]>("/api/days");
}

export async function getDay(id: string): Promise<Day> {
  if (USE_MOCK) {
    const d = [...sessionDays, ...(mockDays as Day[])].find((x) => x.id === id);
    if (!d) throw new Error("404");
    return d;
  }
  return http<Day>(`/api/days/${id}`);
}

export async function createDay(input: NewDayInput): Promise<Day> {
  if (USE_MOCK) return mockCreate(input);
  const fd = new FormData();
  fd.append("text", input.text);
  input.photos.forEach((p) => fd.append("photos", p));
  if (input.song_url) fd.append("song_url", input.song_url);
  if (input.song_file) fd.append("song_file", input.song_file);
  if (input.date) fd.append("date", input.date);
  return http<Day>("/api/days", { method: "POST", body: fd });
}

export const zipUrl = (id: string) => (USE_MOCK ? null : `${API}/api/days/${id}/zip`);

export async function uploadMemory(id: string, video: Blob): Promise<Day | null> {
  if (USE_MOCK) return null;
  const fd = new FormData();
  fd.append("file", video, "memory.webm");
  return http<Day>(`/api/days/${id}/memory`, { method: "PUT", body: fd });
}

/** Для /lab: пересчитать стиль по правилам бэка. В мок-режиме недоступно. */
export async function previewStyle(body: StylePreviewIn): Promise<StylePreviewOut | null> {
  if (USE_MOCK) return null;
  return http<StylePreviewOut>("/api/style", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- мок создания дня: берём ближайший по словам мок как «стиль», подставляем ввод пользователя
async function mockCreate(input: NewDayInput): Promise<Day> {
  await new Promise((r) => setTimeout(r, 2400));
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
