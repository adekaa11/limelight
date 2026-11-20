import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import MemoryPlayer, { type MemoryPlayerHandle } from "../player/MemoryPlayer";
import { Renderer } from "../player/renderer";
import { downloadBlob, canExport } from "../player/exportVideo";
import PaletteStrip from "../components/PaletteStrip";
import { getDay, uploadMemory, USE_MOCK, zipUrl } from "../api";
import { pageNumbers, useDays } from "../lib/useDays";
import { ageDays, formatDate } from "../lib/date";
import { TECHNIQUES, type Day } from "../types";

export default function DayView() {
  const { id = "" } = useParams();
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { days } = useDays();
  const player = useRef<MemoryPlayerHandle>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    setDay(null);
    setError(null);
    getDay(id).then(setDay, (e: Error) => setError(e.message === "404" ? "Такого дня нет в дневнике" : e.message));
  }, [id]);

  const nums = useMemo(() => pageNumbers(days ?? []), [days]);
  const order = useMemo(() => [...(days ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)), [days]);
  const idx = order.findIndex((d) => d.id === id);
  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const rules = useMemo(() => (day ? new Renderer(day).rules() : []), [day]);

  if (error) return <p className="py-20 text-center font-serif text-2xl">{error}</p>;
  if (!day) return <p className="py-20 text-center font-serif text-xl italic text-muted">достаём страницу…</p>;

  const doExport = async () => {
    if (!player.current) return;
    setExportMsg(null);
    setExporting(0);
    try {
      const blob = await player.current.exportVideo((p) => setExporting(p));
      downloadBlob(blob, `${day.folder ?? day.title}.webm`);
      const updated = await uploadMemory(day.id, blob).catch(() => null);
      if (updated) setDay(updated);
      setExportMsg(updated ? "Видео сохранено в папку дня" : "Видео скачано");
    } catch (e) {
      setExportMsg((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const zip = zipUrl(day.id);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between text-sm text-muted">
        {prev ? <Link to={`/day/${prev.id}`}>← {prev.title}</Link> : <span />}
        <Link to="/" className="hidden sm:inline">
          в архив
        </Link>
        {next ? <Link to={`/day/${next.id}`}>{next.title} →</Link> : <span />}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="mx-auto w-full max-w-[420px] lg:sticky lg:top-20 lg:self-start">
          <MemoryPlayer ref={player} day={day} pageNumber={nums.get(day.id)} />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <VoiceButton day={day} />
            {zip ? (
              <a className="btn" href={zip}>
                ⇣ Папка дня (zip)
              </a>
            ) : (
              <button className="btn" disabled title="Доступно с подключённым бэкендом">
                ⇣ Папка дня (zip)
              </button>
            )}
            <button className="btn" onClick={doExport} disabled={exporting !== null || !canExport()} title={canExport() ? "" : "Нужен Chrome, Edge или Firefox"}>
              {exporting !== null ? `● запись ${Math.round(exporting * 100)}%` : "⏺ Экспорт видео"}
            </button>
          </div>
          {exportMsg && <p className="mt-2 text-center text-xs text-muted">{exportMsg}</p>}
          {day.video_url && (
            <p className="mt-2 text-center text-xs">
              <a className="underline" href={day.video_url} target="_blank" rel="noreferrer">
                готовое видео в папке дня
              </a>
            </p>
          )}
        </div>

        <div>
          <p className="label">{formatDate(day.date)}</p>
          <h1 className="mt-1 font-serif text-4xl font-semibold leading-tight sm:text-5xl">{day.title}</h1>
          {day.folder && <p className="mt-1 font-mono text-xs text-muted">📁 days/{day.folder}/</p>}
          <Recipe day={day} rules={rules} />
        </div>
      </div>
    </div>
  );
}

function Recipe({ day, rules }: { day: Day; rules: string[] }) {
  const a = day.song?.analysis;
  const ta = day.text_analysis;
  const tech = TECHNIQUES.find((t) => t.id === day.style.technique);
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Рецепт дня</h2>
      <p className="text-sm text-muted">Что вы дали системе, какие правила сработали и что получилось.</p>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Block n="1" title="Вход">
          <p className={`font-serif text-lg leading-snug ${open ? "" : "line-clamp-4"}`}>«{day.text}»</p>
          {day.text.length > 180 && (
            <button className="mt-1 text-xs text-muted underline" onClick={() => setOpen((o) => !o)}>
              {open ? "свернуть" : "весь текст"}
            </button>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            <span className="chip">настроение: {ta.mood}</span>
            {ta.season && <span className="chip">{ta.season}</span>}
            {ta.time_of_day && <span className="chip">{ta.time_of_day}</span>}
            <span className="chip">энергия {ta.energy.toFixed(2)}</span>
            <span className="chip">валентность {ta.valence.toFixed(2)}</span>
            {ta.people.map((p) => (
              <span key={p} className="chip">
                👤 {p}
              </span>
            ))}
            {ta.places.map((p) => (
              <span key={p} className="chip">
                📍 {p}
              </span>
            ))}
          </div>
          {!!ta.details.length && <p className="mt-2 font-hand text-xl leading-tight text-ink/80">{ta.details.join(" · ")}</p>}

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {day.photos.map((p, i) => (
              <div key={p + i}>
                <img src={p} alt="" className="aspect-square w-full rounded-sm object-cover" crossOrigin="anonymous" />
                <div className="mt-0.5 flex h-1.5 overflow-hidden rounded-full">
                  {(day.photo_analysis[i]?.dominant_colors ?? []).map((c) => (
                    <span key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {day.song && (
            <div className="mt-4 rounded-sm bg-paper2/60 p-3">
              <p className="font-serif text-lg leading-tight">
                ♪ {day.song.title ?? "Песня"}
                {day.song.artist && <span className="text-muted"> — {day.song.artist}</span>}
              </p>
              {a && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="chip">{Math.round(a.bpm)} BPM</span>
                  <span className="chip">{a.mode === "major" ? "мажор" : "минор"}</span>
                  <span className="chip">энергия {a.energy.toFixed(2)}</span>
                  <span className="chip">валентность {a.valence.toFixed(2)}</span>
                  {a.genre && <span className="chip">{a.genre}</span>}
                  {a.year && <span className="chip">{a.year}</span>}
                  <span className="chip">{a.beats.length} битов · {a.sections.length} части</span>
                </div>
              )}
              {day.song.source_url && (
                <a href={day.song.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-muted underline">
                  слушать целиком
                </a>
              )}
            </div>
          )}
        </Block>

        <Block n="2" title="Сработавшие правила">
          <ol className="space-y-1.5 text-sm">
            {day.explanation.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted">→</span>
                <span>{e}</span>
              </li>
            ))}
          </ol>
          <p className="label mt-4">на экране</p>
          <ol className="mt-1.5 space-y-1.5 text-sm text-ink/80">
            {rules.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted">→</span>
                <span>{e}</span>
              </li>
            ))}
          </ol>
          {day.meta && (
            <p className="mt-3 text-[11px] text-muted">
              анализ текста: {day.meta.llm} · песня: {day.meta.song_source}
            </p>
          )}
        </Block>

        <Block n="3" title="Результат">
          <p className="font-serif text-2xl leading-none">{tech?.name}</p>
          <p className="text-sm text-muted">
            {tech?.ref} · для: {tech?.when}
          </p>
          <PaletteStrip palette={day.style.palette} className="mt-3 h-8 !rounded-sm" />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
            {day.style.palette.map((c, i) => (
              <span key={i}>{i === 0 ? `фон ${c}` : c}</span>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <Meter label="зерно" v={day.style.grain} />
            <Meter label="движение" v={day.style.motion} />
            <Meter label="плотность" v={day.style.density} />
            <Meter label={`шрифт ${day.style.font_weight}`} v={(day.style.font_weight - 300) / 500} />
          </div>
          <p className="mt-3 text-sm">смена кадра: каждый {day.style.beat_step === 1 ? "" : `${day.style.beat_step}-й `}бит</p>
          <p className="mt-1 font-hand text-2xl">«{day.style.caption}»</p>
          <p className="mt-3 text-sm">
            голос: {day.voice.name.replace("ru-RU-", "").replace("Neural", "")}, темп {day.voice.rate}, высота {day.voice.pitch}
          </p>
          <p className="mt-1 text-xs text-muted">возраст записи: {ageDays(day.date)} дн.</p>
        </Block>
      </div>
    </section>
  );
}

function Block({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="label mb-3">
        {n} · {title}
      </p>
      {children}
    </div>
  );
}

function Meter({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-24 text-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
        <span className="block h-full bg-ink/70" style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
      </span>
      <span className="w-8 text-right font-mono">{v.toFixed(2)}</span>
    </div>
  );
}

/** Озвучка: mp3 из папки дня (edge-tts); без бэкенда — голос браузера с теми же темпом и высотой. */
function VoiceButton({ day }: { day: Day }) {
  const [on, setOn] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
    [day.id],
  );
  const toggle = () => {
    if (on) {
      audio.current?.pause();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      setOn(false);
      return;
    }
    if (day.voice.url) {
      audio.current = new Audio(day.voice.url);
      audio.current.onended = () => setOn(false);
      audio.current.play().then(() => setOn(true), () => setOn(false));
    } else if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(day.text);
      u.lang = "ru-RU";
      u.rate = 1 + (parseFloat(day.voice.rate) || 0) / 100;
      u.pitch = 1 + (parseFloat(day.voice.pitch) || 0) / 50;
      const female = /Svetlana|Dariya/.test(day.voice.name);
      const v = speechSynthesis.getVoices().filter((x) => x.lang.startsWith("ru"));
      u.voice = v.find((x) => (female ? /female|светлана|милена|irina|ирина|dariya|svetlana/i : /male|дмитрий|pavel|dmitry/i).test(x.name)) ?? v[0] ?? null;
      u.onend = () => setOn(false);
      speechSynthesis.speak(u);
      setOn(true);
    }
  };
  return (
    <button className="btn" onClick={toggle} title={day.voice.url ? "" : USE_MOCK ? "демо: голос браузера" : "голос браузера"}>
      {on ? "■ Стоп" : "🔈 Озвучка"}
    </button>
  );
}
