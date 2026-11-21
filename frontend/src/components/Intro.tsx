import { useState } from "react";
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
    <section className="mb-10 grid items-center gap-8 border-b border-line pb-10 md:grid-cols-[1fr_200px] lg:grid-cols-[1fr_230px]">
      <div>
        <h1 className="font-serif text-4xl font-semibold leading-[1.05]">Дневник, который помнит, как ощущался день</h1>
        <p className="mt-3 max-w-xl text-muted">
          Запись о дне, фото и песня превращаются в живую страницу с музыкой. Всё строится из твоих фото и песни, без сгенерированных картинок.
        </p>

        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="flex gap-3 sm:block">
              <span className="font-serif text-4xl font-semibold leading-none text-accent">{i + 1}</span>
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
            <Link to={`/day/${example.id}`} className="text-sm text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
              открыть пример
            </Link>
          )}
          {!force && (
            <button onClick={hide} className="text-xs text-muted hover:text-ink">
              больше не показывать
            </button>
          )}
        </div>
      </div>

      {example && (
        <Link to={`/day/${example.id}`} className="group mx-auto hidden w-full md:block" aria-label={`пример: ${example.title}`}>
          <Poster day={example} className="rounded-[3px] shadow-[0_20px_50px_-20px_rgba(60,40,20,0.45)] transition group-hover:-translate-y-1" />
          <PaletteStrip palette={example.style.palette} className="mt-2 h-1.5" />
          <p className="mt-1.5 font-hand text-xl leading-tight text-ink/70">так выглядит один день</p>
        </Link>
      )}

    </section>
  );
}
