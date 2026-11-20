import { useEffect, useState } from "react";
import type { Day } from "../types";
import { posterFor } from "../player/poster";

/** Превью дня 9:16 — тот же рендер, что у плеера, с возрастным выцветанием. */
export default function Poster({ day, width = 360, pageNumber, className = "" }: { day: Day; width?: number; pageNumber?: number; className?: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let alive = true;
    posterFor(day, width, pageNumber).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [day, width, pageNumber]);
  return (
    <div className={`relative aspect-[9/16] overflow-hidden bg-paper2 ${className}`} style={{ background: day.style.palette[0] }}>
      {src ? (
        <img src={src} alt={day.title} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-white/20" />
      )}
    </div>
  );
}
