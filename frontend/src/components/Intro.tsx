import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import Poster from "./Poster";
import PaletteStrip from "./PaletteStrip";
import type { Day } from "../types";

const STEPS = [
  { t: "Напиши о дне", d: "как рассказал бы другу: погода, свет, запахи, звуки" },
  { t: "Добавь фото и песню", d: "цвета фото станут палитрой, темп песни задаст ритм" },
  { t: "День проявится", d: "страница-воспоминание с музыкой на 20–30 секунд и папка дня" },
];

const KEY = "intro-hidden";
const isHidden = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** Первый экран для нового человека: что это и что делать, за 5 секунд. */
export default function Intro({ example, force = false }: { example?: Day; force?: boolean }) {
  const [hidden, setHidden] = useState(isHidden);
  if (hidden && !force) return null;
  const hide = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* приватный режим */
    }
    setHidden(true);
  };

  return (
    <section className="mb-12 grid items-center gap-10 border-b border-line pb-12 md:grid-cols-[1fr_220px] lg:grid-cols-[1fr_270px]">
      <div>
        <h1 className="max-w-[14ch] text-balance font-serif text-[44px] font-semibold leading-[0.98] tracking-[-0.01em] sm:text-6xl lg:text-[88px]">Дневник, который помнит, как ощущался день</h1>
        <p className="mt-5 max-w-xl text-muted">
          Запись о дне, фото и песня превращаются в живую страницу с музыкой. Всё строится из твоих фото и песни, без сгенерированных картинок.
        </p>

        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="reveal flex gap-3 sm:block" style={{ "--i": i } as CSSProperties}>
              <span className="font-serif text-4xl font-semibold leading-none text-safelight">{i + 1}</span>
              <span className="block">
                <span className="block font-serif text-2xl leading-tight sm:mt-1">{s.t}</span>
                <span className="block text-sm text-muted">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link to="/new" className="btn-primary px-6 py-3 text-base">
            Записать день
          </Link>
          {example && (
            <Link to={`/day/${example.id}`} className="text-sm text-text underline decoration-text/30 underline-offset-4 hover:decoration-safelight">
              открыть пример
            </Link>
          )}
          {!force && (
            <button onClick={hide} className="text-xs text-muted hover:text-text">
              больше не показывать
            </button>
          )}
        </div>
      </div>

      {example && (
        <Link to={`/day/${example.id}`} className="group relative mx-auto hidden w-full md:block" aria-label={`пример: ${example.title}`}>
          {/* красный свет лампы над отпечатком */}
          <div aria-hidden className="lamp-glow pointer-events-none absolute -inset-x-16 -top-24 bottom-1/3 bg-[radial-gradient(ellipse_at_50%_0%,rgb(var(--safelight)/0.28),transparent_68%)]" />
          <Poster day={example} className="develop-loop relative rounded-[3px] shadow-print transition duration-500 group-hover:-translate-y-1 group-hover:shadow-print-lift" />
          <PaletteStrip palette={example.style.palette} className="mt-2 h-1.5" />
          <p className="mt-1.5 font-hand text-xl leading-tight text-safelight">так выглядит один день</p>
        </Link>
      )}

    </section>
  );
}
