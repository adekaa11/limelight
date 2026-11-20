import { useEffect, useState } from "react";

/**
 * Экран создания дня (замеры бэка: с песней ~65 с, без песни ~20 с, после простоя Render + до минуты).
 * Этапы «будим сервер» и «отправляем файлы» — настоящие (warmUp и прогресс XHR),
 * этапы анализа идут по типичным таймингам бэка: сервер анализирует параллельно и прогресс не отдаёт.
 * Фото пользователя «проявляется» по мере прогресса — та же метафора, что у плеера.
 */
export type Phase = "wake" | "upload" | "processing" | "done" | "error";

const ANALYSIS = [
  { at: 0, label: "Слушаем песню", hint: "темп, лад, энергия, биты и части песни" },
  { at: 12, label: "Смотрим на свет в фото", hint: "доминантные цвета, яркость, теплота" },
  { at: 20, label: "Читаем, как прошёл день", hint: "настроение, время года и суток, запахи и звуки" },
  { at: 38, label: "Выбираем технику и палитру", hint: "60% цвета фото + 40% сдвиг по настроению" },
  { at: 46, label: "Подбираем название папки", hint: "3–7 слов, по смыслу записи" },
  { at: 52, label: "Записываем озвучку", hint: "голос и темп — по энергии дня" },
  { at: 60, label: "Складываем папку дня", hint: "текст, фото, песня, голос, рецепт" },
];

const FACTS = [
  "Темп песни задаёт ритм: быстрее 120 BPM — кадр меняется на каждый 4-й бит, медленнее 80 — на каждый.",
  "Минор забирает 25% насыщенности и оставляет больше пустоты на странице.",
  "Палитра — это 60% цветов ваших фото и 40% сдвиг по сезону, времени суток и настроению.",
  "Чем старше песня, тем больше плёночного зерна.",
  "Запахи и звуки из текста появятся от руки на полях страницы.",
  "Через год запись выцветет, а при открытии снова проявится — как фотография.",
  "Каждое сработавшее правило будет видно в «Рецепте дня».",
];

interface Props {
  phase: Phase;
  upload: number;
  photo?: string;
  error?: string | null;
  onRetry(): void;
  onBack(): void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function DevelopingScreen({ phase, upload, photo, error, onRetry, onBack }: Props) {
  const [t0] = useState(Date.now());
  const [procStart, setProcStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [wasAsleep] = useState(phase === "wake");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (phase === "processing" && procStart === null) setProcStart(Date.now());
  }, [phase, procStart]);

  const total = Math.round((now - t0) / 1000);
  const proc = procStart ? (now - procStart) / 1000 : 0;
  const stageIdx = phase === "done" ? ANALYSIS.length : ANALYSIS.reduce((i, s, k) => (proc >= s.at ? k : i), 0);

  // общий прогресс для «проявления» фото: никогда не упирается в 100%, пока сервер не ответил
  let p = 0;
  if (phase === "wake") p = 0.04 * Math.min(1, total / 50);
  else if (phase === "upload") p = 0.05 + 0.15 * upload;
  else if (phase === "processing") p = 0.2 + 0.75 * (1 - Math.exp(-proc / 32));
  else if (phase === "done") p = 1;
  else p = 0.15;

  const fact = FACTS[Math.floor(total / 7) % FACTS.length];

  const steps: { label: string; hint?: string; state: "done" | "active" | "todo"; extra?: string }[] = [];
  if (wasAsleep)
    steps.push({ label: "Будим сервер", hint: "бесплатный хостинг засыпает без посетителей, до минуты", state: phase === "wake" ? "active" : "done" });
  steps.push({
    label: "Отправляем фото и песню",
    state: phase === "wake" ? "todo" : phase === "upload" ? "active" : "done",
    extra: phase === "upload" ? `${Math.round(upload * 100)}%` : undefined,
  });
  ANALYSIS.forEach((s, i) =>
    steps.push({
      label: s.label,
      hint: s.hint,
      state: phase === "done" || (phase === "processing" && i < stageIdx) ? "done" : phase === "processing" && i === stageIdx ? "active" : "todo",
    }),
  );

  return (
    <div className="mx-auto grid max-w-4xl items-start gap-10 py-6 md:grid-cols-[260px_1fr] md:py-12">
      <div className="mx-auto w-48 md:w-full">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[3px] bg-[#f6f1e7] shadow-[0_20px_50px_-20px_rgba(60,40,20,0.45)]">
          <div className="absolute left-[6%] top-[5%] h-[1.6%] w-[34%] rounded-full bg-ink/15" style={{ opacity: Math.min(1, p * 3) }} />
          <div className="absolute left-[6%] top-[9%] h-[3%] w-[70%] rounded-full bg-ink/20" style={{ opacity: Math.min(1, p * 2) }} />
          <div className="absolute left-[6%] right-[6%] top-[16.3%] bottom-[25%] bg-white p-[3%] shadow">
            {photo ? (
              <img
                src={photo}
                alt=""
                className="h-full w-full object-cover transition-[filter] duration-500"
                style={{ filter: `grayscale(${1 - p}) sepia(${(1 - p) * 0.4}) brightness(${1 + (1 - p) * 1.4}) contrast(${0.5 + 0.5 * p}) blur(${(1 - p) * 4}px)` }}
              />
            ) : (
              <div className="h-full w-full bg-paper2" />
            )}
          </div>
          <div className="absolute bottom-[10%] left-[6%] font-hand text-xl text-ink/60" style={{ opacity: phase === "done" ? 1 : 0.15 + p * 0.5 }}>
            проявляется…
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full bg-ink/60 transition-[width] duration-500" style={{ width: `${p * 100}%` }} />
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          {fmt(total)} · обычно около минуты{wasAsleep ? " + пробуждение сервера" : ""}
        </p>
      </div>

      <div>
        <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{phase === "error" ? "Не получилось проявить день" : phase === "done" ? "Готово" : "Проявляем день"}</h1>
        {phase === "error" ? (
          <div className="mt-4">
            <p className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
            <p className="mt-2 text-sm text-muted">Текст, фото и песня остались в форме, вводить заново не нужно.</p>
            <div className="mt-4 flex gap-2">
              <button className="btn-primary" onClick={onRetry}>
                Попробовать ещё раз
              </button>
              <button className="btn" onClick={onBack}>
                Вернуться к записи
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Можно не обновлять страницу: как только папка дня будет готова, она откроется сама.</p>
            <ol className="mt-6 space-y-2.5">
              {steps.map((s) => (
                <li key={s.label} className={`flex gap-3 transition ${s.state === "todo" ? "opacity-30" : ""}`}>
                  <span className="mt-1 w-5 shrink-0 text-center text-sm">
                    {s.state === "done" ? "✓" : s.state === "active" ? <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" /> : "·"}
                  </span>
                  <span>
                    <span className={`font-serif text-xl leading-tight ${s.state === "done" ? "text-muted" : ""}`}>
                      {s.label}
                      {s.extra && <span className="ml-2 font-sans text-sm text-muted">{s.extra}</span>}
                    </span>
                    {s.hint && s.state === "active" && (
                      <span className="block text-xs text-muted">
                        {s.label.startsWith("Складываем") && proc > 90 ? "бесплатный сервер сегодня не торопится — ещё немного, страница откроется сама" : s.hint}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-8 border-l-2 border-line pl-3 font-serif text-lg italic leading-snug text-ink/70" key={fact}>
              {fact}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
