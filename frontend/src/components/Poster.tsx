import { useEffect, useState } from "react";
import type { Day } from "../types";
import { posterFor } from "../player/poster";
import { ageDays, fadeForAge } from "../lib/date";

/**
 * Превью дня 9:16 — тот же рендер, что у плеера, с возрастным выцветанием.
 * develop: при наведении на родителя с классом group выцветший отпечаток проявляется в цвет
 * (поверх лежит свежий кадр того же дня, без старения).
 */
export default function Poster({
  day,
  width = 360,
  pageNumber,
  className = "",
  develop = false,
}: {
  day: Day;
  width?: number;
  pageNumber?: number;
  className?: string;
  develop?: boolean;
}) {
  const [src, setSrc] = useState<string>("");
  const [fresh, setFresh] = useState<string>("");
  const fade = fadeForAge(ageDays(day.date));
  const aged = develop && fade > 0.05;

  useEffect(() => {
    let alive = true;
    posterFor(day, width, pageNumber).then((s) => alive && setSrc(s));
    if (aged) posterFor(day, width, pageNumber, 0).then((s) => alive && setFresh(s));
    return () => {
      alive = false;
    };
  }, [day, width, pageNumber, aged]);

  return (
    <div className={`relative aspect-[9/16] overflow-hidden ${className}`} style={{ background: day.style.palette[0] }}>
      {src ? (
        <img
          src={src}
          alt={day.title}
          className={`h-full w-full object-cover ${aged ? "print-develop" : ""}`}
          style={aged ? { filter: `grayscale(${Math.min(1, 0.3 + fade * 1.4)})` } : undefined}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-white/20" />
      )}
      {aged && fresh && (
        <img
          src={fresh}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-[900ms] ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      )}
    </div>
  );
}
