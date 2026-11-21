import { forwardRef, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import { Link } from "react-router-dom";
import HTMLFlipBookRaw from "react-pageflip";
import Poster from "../components/Poster";
import Intro from "../components/Intro";
import PaletteStrip from "../components/PaletteStrip";
import { pageNumbers, useDays } from "../lib/useDays";
import { MONTHS, formatDate } from "../lib/date";
import { TECHNIQUES, techniqueName, type Day, type Technique } from "../types";

// типы react-pageflip требуют все пропсы разом — оборачиваем
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HTMLFlipBook = HTMLFlipBookRaw as unknown as ComponentType<any>;

const Page = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(function Page({ children, className = "" }, ref) {
  return (
    <div ref={ref} className={`book-page ${className}`}>
      {children}
    </div>
  );
});

type View = "book" | "feed";
const loadView = (): View => {
  try {
    return (localStorage.getItem("archive-view") as View) || "feed";
  } catch {
    return "feed";
  }
};

export default function Archive() {
  const { days, error } = useDays();
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [tech, setTech] = useState<Technique | "">("");
  const [view, setView] = useState<View>(loadView);
  useEffect(() => {
    try {
      localStorage.setItem("archive-view", view);
    } catch {
      /* приватный режим */
    }
  }, [view]);

  const nums = useMemo(() => pageNumbers(days ?? []), [days]);
  const months = useMemo(() => [...new Set((days ?? []).map((d) => d.date.slice(0, 7)))].sort().reverse(), [days]);
  const list = useMemo(
    () =>
      (days ?? []).filter(
        (d) => (!q || d.title.toLowerCase().includes(q.toLowerCase().trim())) && (!month || d.date.startsWith(month)) && (!tech || d.style.technique === tech),
      ),
    [days, q, month, tech],
  );

  if (error) return <p className="py-20 text-center text-muted">Не удалось открыть дневник: {error}</p>;
  if (!days) return <p className="py-20 text-center font-serif text-xl italic text-muted">листаем дневник…</p>;
  if (!days.length) return <Intro force />;

  const monthLabel = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;

  return (
    <div>
      <Intro example={days[0]} />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-serif text-4xl font-semibold leading-none">Архив</h2>
          <p className="mt-1 text-sm text-muted">
            {days.length} {days.length === 1 ? "день" : days.length < 5 ? "дня" : "дней"} · старые страницы выцветают, при открытии проявляются
          </p>
        </div>
        <input className="input w-full sm:w-56" placeholder="Поиск по названию" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">Все месяцы</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={tech} onChange={(e) => setTech(e.target.value as Technique | "")}>
          <option value="">Все техники</option>
          {TECHNIQUES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-full border border-line p-0.5 text-sm">
          {(["feed", "book"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? "seg-on" : "text-muted"}`}>
              {v === "book" ? "Книга" : "Лента"}
            </button>
          ))}
        </div>
      </div>

      {!list.length && <p className="py-16 text-center text-muted">Ничего не нашлось. Попробуйте другое слово или сбросьте фильтры.</p>}

      {!!list.length && view === "book" && <Book key={`${q}|${month}|${tech}`} days={list} nums={nums} />}
      {!!list.length && view === "feed" && <Feed days={list} nums={nums} />}
    </div>
  );
}

function Book({ days, nums }: { days: Day[]; nums: Map<string, number> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const book = useRef<any>(null);
  const [page, setPage] = useState(0);
  const total = days.length + 2;
  return (
    <div className="flex flex-col items-center py-2">
      <HTMLFlipBook
        ref={book}
        onFlip={(e: { data: number }) => setPage(e.data)}
        width={360}
        height={640}
        size="stretch"
        minWidth={240}
        maxWidth={460}
        minHeight={427}
        maxHeight={818}
        showCover
        drawShadow
        maxShadowOpacity={0.35}
        flippingTime={800}
        mobileScrollSupport
        usePortrait
        clickEventForward
        useMouseEvents
        swipeDistance={30}
        showPageCorners
        startPage={0}
        startZIndex={0}
        autoSize
        disableFlipByClick={false}
        style={{}}
      >
        <Page className="!bg-[#3b2f27] text-print">
          <div className="flex h-full flex-col items-center justify-center border-[10px] border-[#3b2f27] p-8 text-center outline outline-1 outline-offset-[-18px] outline-[#c9a77c]/50">
            <p className="label !text-[#c9a77c]">дневник</p>
            <p className="mt-4 font-serif text-5xl font-semibold">LimeLight</p>
            <p className="mt-4 max-w-[16rem] font-serif text-lg italic text-print/70">как ощущался каждый день</p>
            <p className="mt-10 font-hand text-2xl text-[#c9a77c]">листайте →</p>
          </div>
        </Page>
        {days.map((d) => (
          <Page key={d.id}>
            <div className="relative h-full">
              <Poster day={d} pageNumber={nums.get(d.id)} className="h-full w-full" />
              <div className="absolute inset-y-0 right-0 w-1.5">
                <PaletteStrip palette={d.style.palette} className="h-full w-full flex-col !rounded-none" />
              </div>
              <Link
                to={`/day/${d.id}`}
                className="absolute bottom-[2.2%] left-1/2 -translate-x-1/2 rounded-full bg-print/90 px-3 py-1 font-serif text-sm text-printink shadow hover:bg-print"
              >
                открыть день →
              </Link>
            </div>
          </Page>
        ))}
        <Page className="!bg-[#3b2f27]">
          <div className="flex h-full items-center justify-center p-8 text-center font-serif text-xl italic text-print/60">продолжение следует…</div>
        </Page>
      </HTMLFlipBook>
      <div className="mt-4 flex items-center gap-4 text-sm text-muted">
        <button className="btn" disabled={page <= 0} onClick={() => book.current?.pageFlip()?.flipPrev()} aria-label="предыдущая страница">
          ←
        </button>
        <span className="min-w-[4rem] text-center font-serif">
          {Math.min(page + 1, total)} / {total}
        </span>
        <button className="btn" disabled={page >= total - 1} onClick={() => book.current?.pageFlip()?.flipNext()} aria-label="следующая страница">
          →
        </button>
      </div>
    </div>
  );
}

/** Лента: отпечатки сушатся на верёвке. Тянуть мышью или листать пальцем вбок. */
function Feed({ days, nums }: { days: Day[]; nums: Map<string, number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const onDown = (e: RPointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      setGrabbing(true);
    }
    if (d.moved) ref.current.scrollLeft = d.left - dx;
  };
  const onUp = () => {
    setGrabbing(false);
    // клик после перетаскивания не должен открывать день
    setTimeout(() => (drag.current = null), 0);
  };

  return (
    <div>
      <div
        ref={ref}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onClickCapture={(e) => drag.current?.moved && e.preventDefault()}
        className={`-mx-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:thin] ${grabbing ? "cursor-grabbing select-none" : "cursor-grab"}`}
      >
        <div className="relative flex w-max gap-7 pb-6 pt-3 sm:gap-9">
          {/* верёвка */}
          <div aria-hidden className="absolute -left-4 -right-4 top-[22px] h-px bg-text/35" />
          {days.map((d, i) => {
            const tilt = ((hash(d.id) % 9) - 4) * 0.5; // ±2°
            return (
              <Link key={d.id} to={`/day/${d.id}`} draggable={false} className="group relative block w-40 shrink-0 pt-2 outline-none sm:w-48 lg:w-52">
                <Pin />
                <div
                  className="origin-top transition-transform duration-500 ease-out group-hover:-translate-y-1.5 group-hover:!rotate-0 group-focus-visible:-translate-y-1.5"
                  style={{ transform: `rotate(${tilt}deg)` }}
                >
                  <Poster
                    day={d}
                    develop
                    pageNumber={nums.get(d.id)}
                    className="rounded-[2px] shadow-print transition-shadow duration-500 group-hover:shadow-print-lift group-focus-visible:ring-2 group-focus-visible:ring-safelight"
                  />
                </div>
                <p className="mt-4 font-serif text-lg leading-tight group-hover:text-safelight">{d.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDate(d.date)} · {techniqueName(d.style.technique)}
                </p>
                <PaletteStrip palette={d.style.palette} className="mt-2 h-1" />
                {i === 0 && <span className="sr-only">Лента листается вбок</span>}
              </Link>
            );
          })}
        </div>
      </div>
      {days.length > 2 && <p className="mt-1 font-hand text-xl text-safelight">тяни вбок, чтобы листать →</p>}
    </div>
  );
}

/** Деревянная прищепка поверх верёвки. */
function Pin() {
  return (
    <svg aria-hidden viewBox="0 0 14 36" className="absolute left-1/2 top-0 z-10 h-9 w-3.5 -translate-x-1/2 text-muted" fill="none">
      <rect x="1.5" y="0.5" width="11" height="35" rx="2.5" fill="currentColor" />
      <path d="M7 1v34" stroke="rgb(var(--room))" strokeWidth="1" />
      <circle cx="7" cy="14" r="2.6" stroke="rgb(var(--room))" strokeWidth="1.2" fill="currentColor" />
    </svg>
  );
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
