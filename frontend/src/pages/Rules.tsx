import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import mockDays from "../mocks/days.json";
import Poster from "../components/Poster";
import PaletteStrip from "../components/PaletteStrip";
import { useDays } from "../lib/useDays";
import { TECHNIQUES, type Day, type Technique } from "../types";

const DOC = "https://github.com/adekaa11/proyavka/blob/main/docs/visual-system.md";

/** Постоянные элементы страницы — номера совпадают с метками на схеме. */
const CONSTANT = [
  { t: "Формат 9:16", d: "поля 6%, одна бумага на все дни" },
  { t: "Дата", d: "сверху слева, Cormorant Garamond" },
  { t: "Название", d: "под датой; толщина шрифта зависит от энергии дня" },
  { t: "Фото в паспарту", d: "белая рамка; как фото лежит на странице, решает техника" },
  { t: "Заметки на полях", d: "запахи, звуки и мелочи из текста, от руки, по одной" },
  { t: "Подпись от руки", d: "одна фраза дня, Caveat" },
  { t: "Номер страницы", d: "внизу справа, как в настоящем дневнике" },
];

const VARIABLE: [string, string, string][] = [
  ["Техника", "настроение, энергия, темп, лад, жанр и год песни, люди, погода", "баллы по таблице ниже, побеждает максимум"],
  ["Палитра", "цвета фото, сезон, время суток, настроение, лад", "60% цвета фото + 40% сдвиг по настроению"],
  ["Смена кадра", "темп песни", "быстрее 120 BPM — каждый 4-й бит, 80–120 — каждый 2-й, медленнее — каждый"],
  ["Смена сцены", "части песни", "новая часть — новая композиция страницы"],
  ["Зерно", "техника и возраст песни", "база техники + до 0.4 за старую песню"],
  ["Движение", "энергия", "0.15 + 0.75 × энергия"],
  ["Контраст", "энергия", "разброс светлоты палитры × (0.8 + 0.5 × энергия)"],
  ["Плотность", "лад, люди, техника", "мажор +0.12, минор −0.12, +0.05 за человека"],
  ["Шрифт названия", "энергия", "300 + 500 × энергия"],
  ["Выцветание", "возраст записи", "месяц 7%, полгода 37%, год 60%; при открытии 3 с проявления"],
];

const WHY: Record<Technique, { why: string; screen: string }> = {
  monet: { why: "мазки размывают контуры, как память размывает детали; мягкий свет — безопасность", screen: "кадры медленно растворяются друг в друге, бас удлиняет мазки" },
  kandinsky: { why: "жёсткая сетка и геометрия — ритм, собранность, давление", screen: "резкая склейка на бит, круги пульсируют с басом" },
  film: { why: "зерно, засветы и выцветание считываются как «это было давно»", screen: "вспышка-передержка на склейке, засветы мерцают" },
  collage: { why: "яркие рваные вырезки — шум, движение, много всего сразу", screen: "на бит один кусок меняет фото и подпрыгивает" },
  japanese: { why: "пустое пространство даёт тишине место на странице", screen: "фото маленькое, растворение не короче 1.2 с" },
};

const SCORES: [string, (number | "")[]][] = [
  ["настроение из своей группы", [3, 3, 3, 3, 3]],
  ["энергия < 0.55", [2, "", "", "", ""]],
  ["энергия ≥ 0.65", ["", 2, "", "", ""]],
  ["энергия < 0.35", ["", "", "", "", 2]],
  ["валентность высокая (≥ 0.55 / ≥ 0.65)", [2, "", "", 2, ""]],
  ["медленный мажор (< 110 BPM)", [2, "", "", "", ""]],
  ["темп ≥ 120 BPM", ["", 2, "", "", ""]],
  ["электронный жанр", ["", 2, "", "", ""]],
  ["работа или учёба в тексте", ["", 2, "", "", ""]],
  ["ночь (кроме тихих дней)", ["", 1, "", "", ""]],
  ["песне ≥ 15 лет", ["", "", 3, "", ""]],
  ["минор", ["", "", 1, "", ""]],
  ["смешанная валентность 0.3–0.6", ["", "", 1, "", ""]],
  ["людей ≥ 3", ["", "", "", 2, ""]],
  ["энергичный мажор", ["", "", "", 2, ""]],
  ["медленный минор (< 90 BPM)", ["", "", "", "", 2]],
  ["дождь, снег, туман", ["", "", "", "", 2]],
  ["в тексте нет людей", ["", "", "", "", 1]],
  ["тёплый свет на фото", [1, "", "", "", ""]],
];
const ORDER: Technique[] = ["monet", "kandinsky", "film", "collage", "japanese"];

const RULES: { title: string; items: [string, string][] }[] = [
  {
    title: "Цвет",
    items: [
      ["зима / весна / лето / осень", "базовый оттенок 210° / 105° / 48° / 28°"],
      ["вечер", "подмешан закатный оранжевый, 25%"],
      ["ночь", "тёмно-синий фон страницы"],
      ["дождь, снег, туман в тексте", "холодная синь, 35%"],
      ["валентность выше или ниже 0.5", "тёплый янтарь или холодная синь, |V − 0.5| × 0.8"],
      ["техника «плёнка»", "сдвиг к сепии, 50%"],
      ["минор / мажор", "насыщенность −25% / +8% и теплее"],
    ],
  },
  {
    title: "Ритм и движение",
    items: [
      ["бит песни", "смена фото ровно на бит, с шагом по темпу"],
      ["новая часть песни", "новая сцена"],
      ["низкие частоты", "пульс: мазки длиннее, круги больше, засветы ярче"],
      ["высокие частоты", "лёгкое дрожание"],
      ["высокая энергия", "больше движения, контраста и толще шрифт"],
    ],
  },
  {
    title: "Время и голос",
    items: [
      ["старая песня", "больше плёночного зерна"],
      ["старая запись", "страница выцветает и желтеет, при открытии проявляется"],
      ["дождь / снег в тексте", "косые линии / медленные точки поверх страницы"],
      ["энергия < 0.4", "голос тихий и медленный, темп −15%"],
      ["энергия > 0.7", "голос живой и быстрый, темп +10%"],
      ["техника «Кандинский»", "ровный мужской голос"],
    ],
  },
];

export default function Rules() {
  const { days } = useDays();
  // для каждой техники — последний настоящий день, иначе пример из моков
  const examples = useMemo(() => {
    const all = [...(days ?? []), ...(mockDays as Day[])];
    return Object.fromEntries(ORDER.map((t) => [t, all.find((d) => d.style.technique === t)])) as Record<Technique, Day | undefined>;
  }, [days]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-serif text-4xl font-semibold leading-tight">Как это работает</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Каждый день — вертикальная страница 9:16 с музыкой. Все страницы складываются в одну серию, но каждая своя: часть элементов постоянна, остальное
        считается из текста, фото и песни по правилам, которые видно в «Рецепте дня». Картинки не генерируются — всё строится из твоих фото.
      </p>

      <Section n="1" title="Постоянное и переменное">
        <div className="grid gap-10 md:grid-cols-[220px_1fr]">
          <div>
            <Schema />
            <ol className="mt-5 space-y-2">
              {CONSTANT.map((c, i) => (
                <li key={c.t} className="flex gap-3">
                  <span className="w-4 shrink-0 font-serif text-lg font-semibold leading-tight text-safelight">{i + 1}</span>
                  <span>
                    <span className="block font-medium leading-tight">{c.t}</span>
                    <span className="block text-sm text-muted">{c.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="label mb-3">переменное — считается для каждого дня</p>
            <div className="divide-y divide-line border-y border-line">
              {VARIABLE.map(([p, from, rule]) => (
                <div key={p} className="grid gap-1 py-2.5 sm:grid-cols-[130px_1fr]">
                  <span className="font-serif text-lg font-semibold leading-tight">{p}</span>
                  <span>
                    <span className="block text-sm text-muted">из: {from}</span>
                    <span className="block">{rule}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section n="2" title="Пять техник">
        <p className="-mt-2 mb-6 max-w-2xl text-muted">Техника — главный переменный элемент: она решает, как фото лежит на странице и как страница двигается под музыку.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {ORDER.map((id) => {
            const t = TECHNIQUES.find((x) => x.id === id)!;
            const ex = examples[id];
            return (
              <div key={id}>
                {ex ? (
                  <Link to={`/day/${ex.id}`} className="block">
                    <Poster day={ex} width={300} className="rounded-[2px] shadow-print" />
                    <PaletteStrip palette={ex.style.palette} className="mt-2 h-1.5 !rounded-none" />
                  </Link>
                ) : (
                  <div className="aspect-[9/16] bg-room2" />
                )}
                <p className="mt-3 font-serif text-2xl font-semibold leading-none">{t.name}</p>
                <p className="mt-1 text-sm text-muted">{t.ref}</p>
                <p className="mt-2 text-sm">
                  <span className="text-muted">для: </span>
                  {t.when}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-muted">почему: </span>
                  {WHY[id].why}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-muted">на экране: </span>
                  {WHY[id].screen}
                </p>
              </div>
            );
          })}
        </div>

        <p className="label mb-3 mt-10">как выбирается техника — баллы, побеждает максимум</p>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[560px] border-y border-line text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-3 font-normal text-muted">условие</th>
                {ORDER.map((id) => (
                  <th key={id} className="w-20 py-2 text-center font-serif text-base font-semibold">
                    {TECHNIQUES.find((x) => x.id === id)!.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {SCORES.map(([cond, pts]) => (
                <tr key={cond}>
                  <td className="py-1.5 pr-3">{cond}</td>
                  {pts.map((p, i) => (
                    <td key={i} className={`py-1.5 text-center ${p ? "font-semibold text-safelight" : ""}`}>
                      {p ? `+${p}` : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">При равенстве баллов порядок: Моне, Кандинский, Плёнка, Коллаж, Ма. Одинаковый ввод всегда даёт одинаковую страницу.</p>
      </Section>

      <Section n="3" title="Правила «условие → следствие»">
        <div className="grid gap-8 md:grid-cols-3">
          {RULES.map((g) => (
            <div key={g.title}>
              <p className="font-serif text-2xl font-semibold">{g.title}</p>
              <ul className="mt-3 space-y-2.5">
                {g.items.map(([c, r]) => (
                  <li key={c} className="leading-snug">
                    <span className="text-muted">{c}</span> <span className="text-muted">→</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <div className="mt-14 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-6">
        <Link to="/lab" className="btn-primary">
          Покрутить параметры в Лаборатории
        </Link>
        <a href={DOC} target="_blank" rel="noreferrer" className="text-sm underline decoration-text/30 underline-offset-4 hover:decoration-text">
          полное описание визуальной системы
        </a>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="mb-6 flex items-baseline gap-3 font-serif text-4xl font-semibold leading-tight">
        <span className="text-safelight">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Схема страницы: где стоят постоянные элементы. Номера — как в списке рядом. */
function Schema() {
  const tag = (n: number, cls: string) => (
    <span className={`absolute grid h-5 w-5 place-items-center rounded-full bg-safelight font-sans text-[11px] font-semibold text-onlight ${cls}`}>{n}</span>
  );
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[220px] rounded-[2px] bg-print shadow-print">
      <div className="absolute inset-[6%] border border-dashed border-printink/15" />
      <p className="absolute left-[6%] top-[5%] font-serif text-[10px] uppercase tracking-wide text-printink/60">21 ноября 2026</p>
      <p className="absolute left-[6%] top-[9%] font-serif text-lg font-semibold leading-none text-printink/80">Название дня</p>
      <div className="absolute bottom-[30%] left-[6%] right-[6%] top-[17%] bg-white p-[3%] shadow">
        <div className="h-full w-full bg-printink/10" />
      </div>
      <p className="absolute bottom-[19%] left-[9%] font-hand text-sm text-printink/60">— запах мандаринов</p>
      <p className="absolute bottom-[9%] left-[6%] font-hand text-lg leading-none text-printink/80">шли по первому снегу</p>
      <p className="absolute bottom-[3.5%] right-[6%] font-serif text-[10px] text-printink/50">— 08</p>
      {tag(1, "-right-2 -top-2")}
      {tag(2, "-left-2 top-[4.5%]")}
      {tag(3, "-left-2 top-[9.5%]")}
      {tag(4, "-left-2 top-[40%]")}
      {tag(5, "-left-2 bottom-[18.5%]")}
      {tag(6, "-left-2 bottom-[8.5%]")}
      {tag(7, "-right-2 bottom-[2.5%]")}
    </div>
  );
}
