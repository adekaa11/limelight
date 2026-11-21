import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Day } from "../types";
import { Renderer } from "./renderer";
import { AudioEngine } from "./audio";
import { SILENT } from "./types";
import { MAX_DURATION } from "./timeline";
import { canExport, startRecording } from "./exportVideo";

export interface MemoryPlayerHandle {
  open(): Promise<void>;
  /** Открыть, поставить на паузу или продолжить — для внешней кнопки */
  toggle(): Promise<void>;
  /** Записывает воспоминание целиком (20–30 с, в реальном времени) и возвращает .webm */
  exportVideo(onProgress?: (p: number) => void): Promise<Blob>;
}

interface Props {
  day: Day;
  pageNumber?: number;
  /** Для /lab: подменить возраст записи в днях. */
  ageDaysOverride?: number;
  className?: string;
  /** Доп. классы кнопки «Открыть день» поверх страницы: на странице дня она нужна только на телефоне, на десктопе кнопки снаружи */
  overlayClass?: string;
  onStateChange?: (s: PlayerState) => void;
}

export type PlayerState = "loading" | "ready" | "playing" | "paused" | "ended";

const MemoryPlayer = forwardRef<MemoryPlayerHandle, Props>(function MemoryPlayer({ day, pageNumber, ageDaysOverride, className, overlayClass = "", onStateChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const recRef = useRef<ReturnType<typeof startRecording> | null>(null);
  const abortRef = useRef<string | null>(null); // причина прерванной записи: недописанное видео не скачиваем и не отправляем
  const progressRef = useRef<((p: number) => void) | undefined>(undefined);
  const stateRef = useRef<PlayerState>("loading");
  const dirtyRef = useRef(true);
  const optsRef = useRef({ pageNumber, ageDaysOverride });
  optsRef.current = { pageNumber, ageDaysOverride };
  const [state, setStateRaw] = useState<PlayerState>("loading");
  const [note, setNote] = useState<string | null>(null);

  const onStateRef = useRef(onStateChange);
  onStateRef.current = onStateChange;
  const setState = useCallback((s: PlayerState) => {
    stateRef.current = s;
    setStateRaw(s);
    dirtyRef.current = true;
    onStateRef.current?.(s);
  }, []);

  // 720×1280 на десктопе, 540×960 на телефоне — держим 30 fps
  const W = useMemo(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 540 : 720), []);
  const H = Math.round((W * 16) / 9);

  const styleKey = `${day.id}|${JSON.stringify(day.style)}|${day.photos.join(",")}|${day.text_analysis.details.join(",")}|${day.title}`;
  const songKey = `${day.id}|${day.song?.preview_url ?? ""}`;

  // подготовка рендера (фото, цветокоррекция, кэш мазков)
  useEffect(() => {
    let alive = true;
    const r = new Renderer(day, W);
    r.prepare().then(() => {
      if (!alive) return;
      rendererRef.current = r;
      dirtyRef.current = true;
      if (stateRef.current === "loading") setState("ready");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey, W]);

  const abortRecording = useCallback((reason: string) => {
    if (!recRef.current) return;
    abortRef.current = reason;
    engineRef.current?.pause();
    recRef.current.stop();
  }, []);

  // звук — свой на каждую песню
  useEffect(() => {
    return () => {
      abortRecording("Запись прервана: вы ушли со страницы дня");
      engineRef.current?.destroy();
      engineRef.current = null;
      if (stateRef.current !== "loading") setState("ready");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songKey]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [pageNumber, ageDaysOverride]);

  // вкладка скрыта или страница выгружается -> пауза (уход со страницы дня = размонтирование, звук гасится выше).
  // Во время экспорта скрытие вкладки прерывает запись: браузер душит кадры и звук, видео вышло бы рваным.
  useEffect(() => {
    const pauseIfHidden = () => {
      const eng = engineRef.current;
      if (!eng || document.visibilityState !== "hidden") return;
      if (recRef.current) {
        abortRecording("Запись остановлена: вкладку свернули. На время записи (до 30 с) оставайтесь на этой вкладке.");
        setState("ended");
      } else if (stateRef.current === "playing") {
        eng.pause();
        setState("paused");
      }
    };
    const onPageHide = () => {
      abortRecording("Запись прервана: страница закрылась");
      engineRef.current?.pause();
    };
    document.addEventListener("visibilitychange", pauseIfHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", pauseIfHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [setState, abortRecording]);

  // цикл отрисовки, не чаще 30 fps
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0, last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / 30 - 3) return;
      last = now;
      const r = rendererRef.current;
      if (!r) return;
      const st = stateRef.current;
      const eng = engineRef.current;
      const { pageNumber: pn, ageDaysOverride: age } = optsRef.current;
      if ((st === "playing" || st === "paused" || st === "ended") && eng) {
        if (st !== "playing" && !dirtyRef.current) return;
        dirtyRef.current = false;
        const D = eng.duration;
        const t = Math.min(eng.time(), D);
        r.draw(ctx, t, st === "playing" ? eng.sample(t) : SILENT, { pageNumber: pn, ageDays: age, duration: D });
        if (barRef.current) barRef.current.style.width = `${(t / D) * 100}%`;
        progressRef.current?.(t / D);
        if (st === "playing" && eng.time() >= D - 0.02) {
          eng.pause();
          recRef.current?.stop();
          setState("ended");
        }
      } else if (dirtyRef.current) {
        dirtyRef.current = false;
        r.draw(ctx, 0.5, SILENT, { poster: true, pageNumber: pn, ageDays: age });
        if (barRef.current) barRef.current.style.width = "0%";
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [setState]);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new AudioEngine(day);
    return engineRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songKey]);

  const open = useCallback(async () => {
    if (!rendererRef.current) return;
    const eng = ensureEngine();
    const isSong = await eng.load();
    if (!isSong)
      setNote(day.song?.preview_url ? "Песня не загрузилась — звучит ритм-эскиз по её анализу" : "Превью песни нет — звучит ритм-эскиз по её BPM, ладу и битам");
    else setNote(null);
    await eng.start();
    setState("playing");
  }, [ensureEngine, day.song?.preview_url, setState]);

  const togglePause = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || recRef.current) return;
    if (stateRef.current === "playing") {
      await eng.pause();
      setState("paused");
    } else if (stateRef.current === "paused") {
      await eng.resume();
      setState("playing");
    }
  }, [setState]);

  const toggle = useCallback(async () => {
    const st = stateRef.current;
    if (st === "ready" || st === "ended") await open();
    else await togglePause();
  }, [open, togglePause]);

  useImperativeHandle(
    ref,
    () => ({
      open,
      toggle,
      async exportVideo(onProgress) {
        if (!canExport()) throw new Error("Этот браузер не умеет записывать видео с canvas. Откройте в Chrome, Edge или Firefox.");
        const canvas = canvasRef.current;
        if (!canvas || !rendererRef.current) throw new Error("Плеер ещё не готов");
        const eng = ensureEngine();
        await eng.load();
        if (eng.ctx.state !== "running") {
          // без настоящего клика браузер не включает звук и resume() не завершается
          await Promise.race([eng.ctx.resume(), new Promise((r) => setTimeout(r, 3000))]);
          if ((eng.ctx.state as AudioContextState) !== "running") throw new Error("Браузер не дал включить звук. Нажмите «Экспорт видео» ещё раз.");
        }
        abortRef.current = null;
        const rec = startRecording(canvas, eng.dest.stream);
        recRef.current = rec;
        progressRef.current = onProgress;
        // сторож на таймере, а не на rAF: конец записи и зависший звук ловим, даже если кадры притормозил браузер
        let lastT = -1, lastMove = Date.now();
        const watchdog = setInterval(() => {
          if (stateRef.current !== "playing") return;
          const t = eng.time();
          if (t >= eng.duration - 0.05) {
            eng.pause();
            rec.stop();
            setState("ended");
          } else if (t !== lastT) {
            lastT = t;
            lastMove = Date.now();
          } else if (Date.now() - lastMove > 6000) {
            abortRecording("Запись остановлена: песня перестала играть (сеть или браузер). Попробуйте ещё раз.");
            setState("ended");
          }
        }, 500);
        try {
          await open();
          const blob = await rec.done;
          if (abortRef.current) throw new Error(abortRef.current);
          return blob;
        } finally {
          clearInterval(watchdog);
          recRef.current = null;
          progressRef.current = undefined;
          abortRef.current = null;
        }
      },
    }),
    [open, toggle, ensureEngine, abortRecording, setState],
  );

  return (
    <div className={`relative select-none ${className ?? ""}`}>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[3px] bg-paper2 shadow-[0_20px_50px_-20px_rgba(60,40,20,0.45)]">
        <canvas ref={canvasRef} width={W} height={H} className="block h-full w-full" onClick={toggle} />
        {state === "loading" && <div className="absolute inset-0 grid place-items-center font-serif text-lg italic text-muted">проявляем…</div>}
        {(state === "ready" || state === "ended") && (
          <button
            onClick={open}
            className={`${overlayClass} absolute bottom-[14%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-ink/20 bg-paper/90 px-5 py-2.5 font-serif text-lg sm:px-6 sm:py-3 sm:text-xl text-ink shadow-lg backdrop-blur transition hover:bg-paper`}
          >
            {state === "ended" ? "↻ Ещё раз" : "▶ Открыть день"}
          </button>
        )}
        {state === "paused" && (
          <button onClick={togglePause} className="absolute inset-0 grid place-items-center bg-black/10 font-serif text-2xl text-white">
            ❚❚ пауза
          </button>
        )}
        <div className="absolute bottom-0 left-0 h-[3px] bg-ink/40" ref={barRef} style={{ width: 0 }} />
      </div>
      {note && <p className="mt-2 text-center text-xs text-muted">{note}</p>}
      <p className="sr-only">Длительность до {MAX_DURATION} секунд</p>
    </div>
  );
});

export default MemoryPlayer;
