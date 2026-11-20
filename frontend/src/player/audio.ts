import type { Day } from "../types";
import type { AudioFrame } from "./types";
import { allBeats, MAX_DURATION, sections } from "./timeline";
import { clamp, countLE } from "../lib/math";

/**
 * Звук воспоминания.
 * 1) Песня дня (preview_url из папки дня или файл пользователя) через <audio> -> MediaElementSource.
 * 2) Если песни нет или она не отдаёт CORS — «ритм-эскиз»: синтез по анализу песни
 *    (те же биты, BPM, лад, части, энергия), чтобы плеер и биты работали и на моках.
 * Всё идёт через AnalyserNode (спектр для мазков и фигур) и MediaStreamDestination (экспорт видео).
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  readonly dest: MediaStreamAudioDestinationNode;
  private master: GainNode;
  private el: HTMLAudioElement | null = null;
  private synthNodes: AudioScheduledSourceNode[] = [];
  private synthStart = 0;
  private bins: Uint8Array;
  private sm = { low: 0, mid: 0, high: 0, level: 0 };
  private peak = { low: 0.25, mid: 0.25, high: 0.15, level: 0.25 };
  private beats: number[];
  mode: "song" | "synth" = "synth";
  duration = MAX_DURATION;
  private loaded = false;

  constructor(private day: Day) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.dest = this.ctx.createMediaStreamDestination();
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.analyser.connect(this.dest);
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.beats = allBeats(day);
  }

  /** Загружает песню. Возвращает false, если пришлось перейти на ритм-эскиз. */
  async load(): Promise<boolean> {
    if (this.loaded) return this.mode === "song";
    this.loaded = true;
    const url = this.day.song?.preview_url;
    if (!url) return false;
    const el = new Audio();
    if (!url.startsWith("blob:") && !url.startsWith("data:")) el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.src = url;
    const ok = await new Promise<boolean>((res) => {
      const done = (v: boolean) => {
        el.oncanplaythrough = el.onerror = null;
        clearTimeout(timer);
        res(v);
      };
      const timer = setTimeout(() => done(el.readyState >= 2), 9000);
      el.oncanplaythrough = () => done(true);
      el.onerror = () => done(false);
      el.load();
    });
    if (!ok) return false;
    try {
      this.ctx.createMediaElementSource(el).connect(this.master);
    } catch {
      return false;
    }
    this.el = el;
    this.mode = "song";
    if (Number.isFinite(el.duration) && el.duration > 3) this.duration = Math.min(MAX_DURATION, el.duration);
    return true;
  }

  async start() {
    await this.load();
    if (this.ctx.state !== "running") await this.ctx.resume();
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(1, now + 0.4);
    g.setValueAtTime(1, now + this.duration - 1.6);
    g.linearRampToValueAtTime(0, now + this.duration);
    if (this.el) {
      this.el.currentTime = 0;
      await this.el.play();
    } else {
      this.stopSynth();
      this.synthStart = now + 0.05;
      this.scheduleSynth(this.synthStart);
    }
  }

  async pause() {
    this.el?.pause();
    if (this.ctx.state === "running") await this.ctx.suspend();
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (this.el) await this.el.play();
  }

  get paused() {
    return this.ctx.state !== "running";
  }

  time() {
    if (this.el) return this.el.currentTime;
    return Math.max(0, this.ctx.currentTime - this.synthStart);
  }

  /** Полосы спектра с адаптивной нормализацией + огибающая бита. */
  sample(t: number): AudioFrame {
    this.analyser.getByteFrequencyData(this.bins);
    const hz = this.ctx.sampleRate / this.analyser.fftSize;
    const band = (a: number, b: number) => {
      const i0 = Math.max(1, Math.floor(a / hz)),
        i1 = Math.min(this.bins.length - 1, Math.ceil(b / hz));
      let s = 0;
      for (let i = i0; i <= i1; i++) s += this.bins[i];
      return s / ((i1 - i0 + 1) * 255);
    };
    const raw = { low: band(30, 180), mid: band(250, 2000), high: band(4000, 11000), level: band(30, 11000) };
    for (const k of ["low", "mid", "high", "level"] as const) {
      this.peak[k] = Math.max(this.peak[k] * 0.996, raw[k], 0.06);
      const v = clamp(raw[k] / this.peak[k]);
      this.sm[k] += (v - this.sm[k]) * (v > this.sm[k] ? 0.55 : 0.12);
    }
    const i = countLE(this.beats, t);
    const beat = i > 0 ? Math.exp(-(t - this.beats[i - 1]) * 7) : 0;
    return { ...this.sm, beat };
  }

  destroy() {
    this.stopSynth();
    this.el?.pause();
    this.el = null;
    this.ctx.close().catch(() => undefined);
  }

  // ---------------- ритм-эскиз ----------------
  private stopSynth() {
    for (const n of this.synthNodes) {
      try {
        n.stop();
      } catch {
        /* уже остановлен */
      }
    }
    this.synthNodes = [];
  }

  private scheduleSynth(t0: number) {
    const a = this.day.song?.analysis;
    const minor = a?.mode === "minor";
    const energy = a?.energy ?? this.day.text_analysis.energy ?? 0.5;
    const ctx = this.ctx;
    const D = this.duration;
    const beats = this.beats.filter((b) => b < D);
    const secs = sections(this.day);
    const root = minor ? 110 : 130.81; // A2 / C3
    // I–vi–IV–V для мажора, i–VI–III–VII для минора; каждая часть песни сдвигает гармонию
    const prog = minor
      ? [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]]
      : [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
    const f = (semi: number, oct = 0) => root * Math.pow(2, semi / 12 + oct);

    const out = ctx.createGain();
    out.gain.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900 + energy * 2600;
    lp.connect(out);
    out.connect(this.master);

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const osc = (type: OscillatorType, freq: number, start: number, dur: number, gain: number, attack = 0.01, dest: AudioNode = lp) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + attack);
      g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
      o.connect(g).connect(dest);
      o.start(start);
      o.stop(start + dur + 0.05);
      this.synthNodes.push(o);
    };

    beats.forEach((b, i) => {
      const t = t0 + b;
      const bar = Math.floor(i / 4);
      const sec = Math.max(0, countLE(secs, b) - 1);
      const chord = prog[(bar + sec) % 4];
      const barLen = beats[Math.min(beats.length - 1, i + 4)] - b || 2;
      if (i % 4 === 0) {
        chord.forEach((s) => osc("triangle", f(s, 1), t, barLen * 1.05, 0.045, barLen * 0.3));
        osc("sine", f(chord[0], -1), t, barLen * 0.95, 0.22, 0.02, out);
      }
      // пульс: на каждый бит у энергичной песни, на сильные доли у тихой
      if (energy > 0.35 || i % 2 === 0) {
        const k = ctx.createOscillator();
        const g = ctx.createGain();
        k.frequency.setValueAtTime(130, t);
        k.frequency.exponentialRampToValueAtTime(42, t + 0.16);
        g.gain.setValueAtTime(0.25 + 0.5 * energy, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        k.connect(g).connect(out);
        k.start(t);
        k.stop(t + 0.35);
        this.synthNodes.push(k);
      }
      // мелодия по звукам аккорда: «музыкальная шкатулка» для тихих дней
      const note = chord[(i * 2 + sec) % 3] + (i % 8 >= 4 ? 12 : 0);
      osc(energy < 0.45 ? "sine" : "triangle", f(note, 2), t, 0.5 + (1 - energy) * 0.6, 0.05);
      // хай-хэт на слабые доли у энергичных песен
      if (energy > 0.5 && i + 1 < beats.length) {
        const tt = t + (beats[i + 1] - b) / 2;
        const s = ctx.createBufferSource();
        s.buffer = noise;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.09 * energy, tt);
        g.gain.exponentialRampToValueAtTime(0.001, tt + 0.06);
        s.connect(hp).connect(g).connect(out);
        s.start(tt);
        s.stop(tt + 0.08);
        this.synthNodes.push(s);
      }
    });
  }
}
