import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDays } from "../lib/useDays";
import { MONTHS } from "../lib/date";
import { paletteGradient } from "../lib/color";
import { techniqueName, type Day } from "../types";

const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** «Год в цветах»: каждый записанный день залит градиентом своей палитры. */
export default function Year() {
  const { days, error } = useDays();
  const years = useMemo(() => [...new Set((days ?? []).map((d) => +d.date.slice(0, 4)))].sort((a, b) => b - a), [days]);
  const [year, setYear] = useState<number | null>(null);
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
  const count = days.filter((d) => d.date.startsWith(String(y))).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="font-serif text-4xl font-semibold leading-none">Год в цветах</h1>
          <p className="mt-1 text-sm text-muted">
            {y}: записано дней — {count}. Цвет клетки = палитра дня.
          </p>
        </div>
        <div className="flex gap-1">
          {(years.length ? years : [y]).map((yy) => (
            <button key={yy} onClick={() => setYear(yy)} className={`rounded-full px-3 py-1 text-sm ${yy === y ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>
              {yy}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MONTHS.map((name, mi) => (
          <Month key={mi} year={y} month={mi} name={name} byDate={byDate} />
        ))}
      </div>
    </div>
  );
}

function Month({ year, month, name, byDate }: { year: number; month: number; name: string; byDate: Map<string, Day> }) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  return (
    <section>
      <h2 className="mb-2 font-serif text-xl">{name}</h2>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w) => (
          <span key={w} className="text-[10px] uppercase tracking-wider text-muted/70">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const day = byDate.get(iso);
          if (!day)
            return (
              <span key={i} className="grid aspect-square place-items-center rounded-[3px] bg-ink/[0.035] text-[10px] text-muted/60">
                {d}
              </span>
            );
          return (
            <Link
              key={i}
              to={`/day/${day.id}`}
              title={`${day.title} · ${techniqueName(day.style.technique)}`}
              className="group relative grid aspect-square place-items-center rounded-[3px] text-[10px] font-semibold text-white shadow-sm transition hover:z-10 hover:scale-[1.6] hover:shadow-lg"
              style={{ background: paletteGradient(day.style.palette) }}
            >
              <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">{d}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
