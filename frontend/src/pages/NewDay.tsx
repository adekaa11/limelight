import { useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createDay, getServerState, USE_MOCK, warmUp } from "../api";
import DevelopingScreen, { type Phase } from "../components/DevelopingScreen";
import { todayIso } from "../lib/date";

const HINTS = [
  { label: "погода", text: "На улице было " },
  { label: "свет", text: "Свет был " },
  { label: "запахи", text: "Пахло " },
  { label: "звуки", text: "Было слышно " },
  { label: "люди", text: "Рядом были " },
  { label: "мелочь", text: "Запомнилась мелочь: " },
];

const MAX_PHOTOS = 8;
const MAX_MB = 20;

export default function NewDay() {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [songMode, setSongMode] = useState<"url" | "file">("url");
  const [songUrl, setSongUrl] = useState("");
  const [songFile, setSongFile] = useState<File | null>(null);
  const [date, setDate] = useState(todayIso());
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<Phase | "form">("form");
  const [upload, setUpload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const addFiles = (list: FileList | File[]) => {
    const imgs = [...list].filter((f) => f.type.startsWith("image/"));
    const big = imgs.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (big) setError(`Фото «${big.name}» больше ${MAX_MB} МБ`);
    setPhotos((p) => [...p, ...imgs.filter((f) => f.size <= MAX_MB * 1024 * 1024)].slice(0, MAX_PHOTOS));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  };

  const hint = (h: string) => {
    setText((t) => (t && !t.endsWith("\n") && !t.endsWith(" ") ? t + " " : t) + h);
    setTimeout(() => {
      const el = textRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    });
  };

  const hasSong = songMode === "url" ? songUrl.trim().length > 3 : !!songFile;
  const ready = text.trim().length >= 10 && photos.length > 0 && hasSong;

  const submit = async () => {
    if (!ready || (phase !== "form" && phase !== "error")) return;
    setError(null);
    try {
      if (getServerState() !== "ready") {
        setPhase("wake");
        if (!(await warmUp())) throw new Error("Сервер не проснулся. Проверьте интернет и попробуйте ещё раз.");
      }
      setPhase("upload");
      setUpload(0);
      const day = await createDay(
        {
          text: text.trim(),
          photos,
          song_url: songMode === "url" ? songUrl.trim() : undefined,
          song_file: songMode === "file" ? songFile : null,
          date,
        },
        (p) => {
          setUpload(p.upload);
          if (p.processing) setPhase("processing");
        },
      );
      setPhase("done");
      setTimeout(() => nav(`/day/${day.id}`, { state: { fresh: true } }), 700);
    } catch (e) {
      setError((e as Error).message || "Не получилось сохранить день");
      setPhase("error");
    }
  };

  // не дать случайно закрыть вкладку посреди создания
  useEffect(() => {
    if (phase === "form" || phase === "error" || phase === "done") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  if (phase !== "form")
    return <DevelopingScreen phase={phase} upload={upload} photo={previews[0]} error={error} onRetry={submit} onBack={() => setPhase("form")} />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-4xl font-semibold">Как прошёл день?</h1>
      <p className="mt-1 text-sm text-muted">Напишите так, как рассказали бы близкому другу. Чем конкретнее погода, свет, запахи и звуки, тем точнее воспоминание.</p>

      <section className="card mt-6 p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {HINTS.map((h) => (
            <button key={h.label} type="button" onClick={() => hint(h.text)} className="chip hover:border-text/40">
              + {h.label}
            </button>
          ))}
        </div>
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Гуляли по парку, всё в жёлтых листьях. Было холодно, но мы пили какао и долго разговаривали…"
          className="w-full resize-y bg-transparent font-serif text-xl leading-relaxed outline-none placeholder:text-muted"
        />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{text.trim().length < 10 ? "минимум 10 символов" : `${text.trim().split(/\s+/).length} слов`}</span>
          <label className="flex items-center gap-2">
            дата
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="input w-auto py-1" />
          </label>
        </div>
      </section>

      <section className="mt-5">
        <p className="label mb-2">Фото дня · до {MAX_PHOTOS}</p>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed p-6 text-center transition ${drag ? "border-safelight/70 bg-safelight/5" : "border-line bg-room2 hover:border-text/30"}`}
        >
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <span className="font-serif text-lg">Перетащите фото сюда или нажмите</span>
          <span className="text-xs text-muted">свет и цвета фото станут палитрой страницы</span>
        </label>
        {!!previews.length && (
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {previews.map((src, i) => (
              <div key={src} className="group relative aspect-square overflow-hidden rounded-sm bg-room2">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-room/80 text-xs text-text opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="убрать фото"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center gap-3">
          <p className="label">Песня дня</p>
          <div className="flex rounded-full border border-line p-0.5 text-xs">
            {(["url", "file"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setSongMode(m)} className={`rounded-full px-3 py-0.5 ${songMode === m ? "seg-on" : "text-muted"}`}>
                {m === "url" ? "ссылка" : "файл"}
              </button>
            ))}
          </div>
        </div>
        {songMode === "url" ? (
          <input
            className="input"
            value={songUrl}
            onChange={(e) => setSongUrl(e.target.value)}
            placeholder="https://www.deezer.com/track/…  или Spotify / Яндекс Музыка / YouTube"
          />
        ) : (
          <label className="input flex cursor-pointer items-center justify-between">
            <span className={songFile ? "" : "text-text/40"}>{songFile ? songFile.name : "mp3, m4a, wav до 20 МБ"}</span>
            <span className="text-xs text-muted">выбрать</span>
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => setSongFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <p className="mt-1.5 text-xs text-muted">Темп задаст ритм смены кадров, лад и энергия — цвет и движение. Храним только 30-секундный фрагмент.</p>
      </section>

      {error && <p className="mt-4 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
        {USE_MOCK && <span className="text-xs text-muted">демо-режим: бэкенд не подключён, стиль возьмётся из похожего примера</span>}
        <button onClick={submit} disabled={!ready} className="btn-primary w-full px-6 py-3 text-base sm:w-auto">
          Проявить день
        </button>
      </div>
    </div>
  );
}
