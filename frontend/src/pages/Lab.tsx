import { useEffect, useMemo, useState } from "react";
import MemoryPlayer from "../player/MemoryPlayer";
import Poster from "../components/Poster";
import { useDays } from "../lib/useDays";
import { ageDays } from "../lib/date";
import { previewStyle, USE_MOCK } from "../api";
import { TECHNIQUES, type Day, type Style, type Technique } from "../types";

/**
 * Лаборатория: живой подбор параметров визуальной системы и показ её жюри.
 * Слева — переключатель техник и ползунки переменных элементов, справа — плеер,
 * снизу — «один день во всех техниках» (постоянные элементы держат серию, переменные меняют характер).
 */
export default function Lab() {
  const { days } = useDays();
  const [baseId, setBaseId] = useState("");
  const base = days?.find((d) => d.id === baseId) ?? days?.[0] ?? null;
  const [style, setStyle] = useState<Style | null>(null);
  const [age, setAge] = useState(0);
  const [applied, setApplied] = useState<Style | null>(null);
  const [rules, setRules] = useState<string[] | null>(null);
  const [inputs, setInputs] = useState({ energy: 0.5, valence: 0.5, bpm: 100, mode: "major" as "major" | "minor" });

  useEffect(() => {
    if (!base) return;
    setStyle(base.style);
    setAge(ageDays(base.date));
    setRules(null);
    const a = base.song?.analysis;
    setInputs({ energy: base.text_analysis.energy, valence: base.text_analysis.valence, bpm: a?.bpm ?? 100, mode: a?.mode ?? "major" });
  }, [base]);

  // ползунки двигаются мгновенно, плеер пересобирается с задержкой (мазки и цветокоррекция не бесплатные)
  useEffect(() => {
    const id = setTimeout(() => setApplied(style), 220);
    return () => clearTimeout(id);
  }, [style]);

  const day: Day | null = useMemo(() => (base && applied ? { ...base, style: applied } : null), [base, applied]);
  if (!days || !base || !style) return <p className="py-20 text-center font-serif text-xl italic text-muted">готовим лабораторию…</p>;

  const set = <K extends keyof Style>(k: K, v: Style[K]) => setStyle((s) => (s ? { ...s, [k]: v } : s));

  const recompute = async () => {
    const a = base.song?.analysis;
    const out = await previewStyle({
      text_analysis: { ...base.text_analysis, energy: inputs.energy, valence: inputs.valence },
      photo_analysis: base.photo_analysis,
      song_analysis: a ? { ...a, bpm: inputs.bpm, mode: inputs.mode } : null,
      caption: style.caption,
    }).catch((e: Error) => {
      setRules([`ошибка: ${e.message}`]);
      return null;
    });
    if (out) {
      setStyle(out.style);
      setRules(out.explanation);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-4xl font-semibold leading-none">Лаборатория</h1>
      <p className="mt-1 text-sm text-muted">Постоянные элементы не трогаем, переменные крутим и смотрим, как меняется день.</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_minmax(0,400px)_1fr]">
        <div className="space-y-5">
          <label className="block">
            <span className="label">день</span>
            <select className="input mt-1" value={base.id} onChange={(e) => setBaseId(e.target.value)}>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.date} · {d.title}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="label">техника</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {TECHNIQUES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => set("technique", t.id as Technique)}
                  className={`rounded-sm border px-2.5 py-1.5 text-xs ${style.technique === t.id ? "border-safelight seg-on" : "border-line hover:border-text/40"}`}
                  title={t.when}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <Slider label="зерно" v={style.grain} on={(v) => set("grain", v)} />
          <Slider label="движение (энергия)" v={style.motion} on={(v) => set("motion", v)} />
          <Slider label="плотность" v={style.density} on={(v) => set("density", v)} />
          <Slider label="жирность названия" v={style.font_weight} min={300} max={700} step={100} on={(v) => set("font_weight", v)} />
          <div>
            <span className="label">смена кадра</span>
            <div className="mt-1 flex gap-1">
              {([1, 2, 4] as const).map((s) => (
                <button key={s} onClick={() => set("beat_step", s)} className={`flex-1 rounded-sm border py-1.5 text-xs ${style.beat_step === s ? "border-safelight seg-on" : "border-line"}`}>
                  каждый {s === 1 ? "" : `${s}-й `}бит
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">палитра (первый — фон)</span>
            <div className="mt-1 flex gap-1">
              {style.palette.map((c, i) => (
                <input
                  key={i}
                  type="color"
                  value={c}
                  onChange={(e) => set("palette", style.palette.map((x, j) => (j === i ? e.target.value : x)))}
                  className="h-10 flex-1 cursor-pointer rounded-sm border border-line bg-transparent"
                />
              ))}
            </div>
          </div>
          <Slider label={`возраст записи: ${age} дн.`} v={age} min={0} max={1000} step={10} on={setAge} />
          <label className="block">
            <span className="label">подпись</span>
            <input className="input mt-1 font-hand text-lg" value={style.caption} onChange={(e) => set("caption", e.target.value)} />
          </label>
          <button className="btn w-full" onClick={() => setStyle(base.style)}>
            сбросить к дню
          </button>

          <div className="card p-3">
            <p className="label">правила бэка (POST /api/style)</p>
            {USE_MOCK ? (
              <p className="mt-2 text-xs text-muted">Доступно с подключённым бэкендом (VITE_API_URL).</p>
            ) : (
              <>
                <Slider label="энергия текста" v={inputs.energy} on={(v) => setInputs((s) => ({ ...s, energy: v }))} />
                <Slider label="валентность текста" v={inputs.valence} on={(v) => setInputs((s) => ({ ...s, valence: v }))} />
                <Slider label={`BPM ${inputs.bpm}`} v={inputs.bpm} min={50} max={180} step={1} on={(v) => setInputs((s) => ({ ...s, bpm: v }))} />
                <div className="mt-2 flex gap-1">
                  {(["major", "minor"] as const).map((m) => (
                    <button key={m} onClick={() => setInputs((s) => ({ ...s, mode: m }))} className={`flex-1 rounded-sm border py-1 text-xs ${inputs.mode === m ? "border-safelight seg-on" : "border-line"}`}>
                      {m === "major" ? "мажор" : "минор"}
                    </button>
                  ))}
                </div>
                <button className="btn-primary mt-3 w-full" onClick={recompute}>
                  пересчитать стиль
                </button>
                {rules && (
                  <ol className="mt-3 space-y-1 text-xs">
                    {rules.map((r, i) => (
                      <li key={i}>→ {r}</li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[400px]">{day && <MemoryPlayer day={day} ageDaysOverride={age} pageNumber={7} />}</div>

        <div>
          <p className="label mb-2">этот день во всех техниках</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">
            {TECHNIQUES.map((t) => (
              <button key={t.id} onClick={() => set("technique", t.id)} className="text-left">
                <Poster day={{ ...base, style: { ...base.style, technique: t.id } }} width={240} className={`rounded-[2px] ${style.technique === t.id ? "ring-2 ring-safelight" : ""}`} />
                <span className="mt-1 block text-xs text-muted">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, v, on, min = 0, max = 1, step = 0.01 }: { label: string; v: number; on: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="mt-2 block">
      <span className="flex justify-between">
        <span className="label">{label}</span>
        <span className="font-mono text-xs text-muted">{step < 1 ? v.toFixed(2) : v}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(+e.target.value)} className="mt-1 w-full accent-[rgb(var(--safelight))]" />
    </label>
  );
}
