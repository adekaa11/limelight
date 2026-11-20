import { useEffect, useState } from "react";
import { useServerState } from "../lib/useServer";

/** Честное сообщение, пока бесплатный Render просыпается (~50 с после простоя). */
export default function ServerBanner() {
  const s = useServerState();
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (s !== "waking") return setSec(0);
    const t0 = Date.now();
    const id = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [s]);
  if (s !== "waking" && s !== "down") return null;
  return (
    <div className="border-b border-line bg-[#efe6d6] px-4 py-2 text-center text-sm text-ink/80">
      {s === "waking" ? (
        <>
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" />
          Будим сервер: бесплатный хостинг засыпает без посетителей, первый ответ — до минуты{sec > 3 ? ` · ${sec} с` : ""}
        </>
      ) : (
        <>Сервер не отвечает. Обновите страницу через минуту.</>
      )}
    </div>
  );
}
