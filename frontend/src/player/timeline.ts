import type { Day } from "../types";
import { countLE } from "../lib/math";

export const MAX_DURATION = 30;

function gridBeats(bpm: number, duration = MAX_DURATION, offset = 0.25) {
  const step = 60 / Math.max(40, bpm || 90);
  const out: number[] = [];
  for (let t = offset; t < duration; t += step) out.push(+t.toFixed(3));
  return out;
}

/** Все биты песни (для огибающей бита). */
export function allBeats(day: Day) {
  const a = day.song?.analysis;
  return a?.beats?.length ? a.beats : gridBeats(a?.bpm ?? 90);
}

/** Моменты смены кадра: каждый beat_step-й бит. */
export function changeTimes(day: Day) {
  const step = day.style.beat_step || 1;
  return allBeats(day).filter((_, i) => i % step === 0);
}

export function sections(day: Day) {
  const s = day.song?.analysis.sections;
  return s && s.length ? [...s].sort((a, b) => a - b) : [0, 10, 20];
}

export function meanInterval(times: number[]) {
  if (times.length < 2) return 1;
  return (times[times.length - 1] - times[0]) / (times.length - 1);
}

export function frameAt(times: number[], interval: number, t: number) {
  const i = countLE(times, t);
  const last = i > 0 ? times[i - 1] : 0;
  return { index: i, since: t - last, interval };
}

export function sceneAt(secs: number[], t: number) {
  const i = Math.max(1, countLE(secs, t));
  return { index: i - 1, since: Math.max(0, t - secs[i - 1]), count: secs.length };
}
