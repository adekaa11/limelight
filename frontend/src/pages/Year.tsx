import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDays } from "../lib/useDays";
import { MONTHS, formatDate } from "../lib/date";
import { plural } from "../lib/plural";
import Poster from "../components/Poster";
import PaletteStrip from "../components/PaletteStrip";
import { techniqueName, type Day } from "../types";

const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** «Год в цветах»: записанный день залит своей палитрой, пустые дни — только бледные цифры. */
export default function Year() {
  const { days, error } = useDays();
  const years = useMemo(() => [...new Set((days ?? []).map((d) => +d.date.slice(0, 4)))].sort((a, b) => b - a), [days]);
  const [year, setYear] = useState<number | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    if (year === null && years.length) setYear(years[0]);
  }, [years, year]);
  const byDate = useMemo(() => {
    const m = new Map<string, Day>();
    (days ?? []).forEach((d) => !m.has(d.date) && m.set(d.date, d));
    return m;
  }, [days]);

  if (error) return <p className="py-20 text-center text-muted">Ошибка: {error}</p>;
  if (!days) return <p className="py-20 text-center font-serif text-xl italic text-muted">раскрашиваем год…</p>;
  const y = year ?? new Date().getFullYear();
  const inYear = days.filter((d) => d.date.startsWith(String(y))).sort((a, b) => (a.date < b.date ? -1 : 1));
  const count = inYear.length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="font-serif text-4xl font-semibold leading-none">Год в цветах</h1>
          <p className="mt-1 text-sm text-muted">
            {y}: записано {plural(count, "день", "дня", "дней")}. Клетка залита палитрой дня, наведи — покажется страница.
          </p>
        </div>
        <div className="flex gap-1">
          {(years.length ? years : [y]).map((yy) => (
            <button key={yy} onClick={() => setYear(yy)} className={`rounded-full px-3 py-1 text-sm ${yy === y ? "seg-on" : "text-muted hover:text-text"}`}>
              {yy}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {MONTHS.map((name, mi) => (
          <Month key={mi} year={y} month={mi} name={name} byDate={byDate} hover={hover} setHover={setHover} />
        ))}
      </div>

      {!!inYear.length && (
        <section className="mt-12 border-t border-line pt-6">
          <h2 className="font-serif text-2xl">Записанные дни</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {inYear.map((d) => (
              <Link key={d.id} to={`/day/${d.id}`} className="group block">
                <PaletteStrip palette={d.style.palette} className="h-3 !rounded-none" />
                <p className="mt-2 text-xs text-muted">
                  {formatDate(d.date)} · {techniqueName(d.style.technique)}
                </p>
                <p className="font-serif text-lg leading-tight group-hover:underline">{d.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Month({
  year,
  month,
  name,
  byDate,
  hover,
  setHover,
}: {
  year: number;
  month: number;
  name: string;
  byDate: Map<string, Day>;
  hover: string | null;
  setHover: (iso: string | null) => void;
}) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  return (
    <section>
      <h2 className="mb-3 font-serif text-2xl">{name}</h2>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEK.map((w) => (
          <span key={w} className="text-[11px] uppercase tracking-wider text-muted">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const day = byDate.get(iso);
          if (!day)
            return (
              <span key={i} className="grid aspect-square place-items-center text-[11px] text-muted/25">
                {d}
              </span>
            );
          return (
            <Link
              key={i}
              to={`/day/${day.id}`}
              aria-label={`${d} ${name}: ${day.title}`}
              onMouseEnter={() => setHover(iso)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(iso)}
              onBlur={() => setHover(null)}
              className="relative block aspect-square"
            >
              <span className="flex h-full w-full overflow-hidden rounded-[2px] transition duration-300 hover:scale-110" style={{ boxShadow: `0 4px 18px -3px ${day.style.palette[2] ?? day.style.palette[0]}` }}>
                {day.style.palette.map((c, k) => (
                  <span key={k} className="flex-1" style={{ background: c }} />
                ))}
              </span>
              <span className="absolute left-1 top-0.5 text-[11px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">{d}</span>
              {hover === iso && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 block w-32 -translate-x-1/2 text-left">
                  <Poster day={day} width={240} className="rounded-[2px] shadow-print" />
                  <span className="mt-1 block rounded-[2px] bg-room/95 px-1.5 py-1 font-serif text-sm leading-tight text-text shadow-sm">{day.title}</span>
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
