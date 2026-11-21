import type { Day } from "../types";
import { Renderer } from "./renderer";
import { SILENT } from "./types";

const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

/**
 * Статичный кадр дня для архива и ленты — тот же рендер, что и у плеера (проверка лентой честная),
 * но с полным возрастным выцветанием: в архиве день «выцвел», при открытии он проявляется.
 */
/** age — возраст в днях для старения; undefined = настоящий возраст записи, 0 = свежий отпечаток. */
export function posterFor(day: Day, width = 360, pageNumber?: number, age?: number): Promise<string> {
  const key = `${day.id}|${width}|${pageNumber}|${age}|${JSON.stringify(day.style)}|${day.photos.join(",")}`;
  let p = cache.get(key);
  if (!p) {
    // рендерим по очереди, чтобы не подвесить телефон
    p = queue.then(async () => {
      const r = new Renderer(day, width);
      await r.prepare();
      const c = document.createElement("canvas");
      c.width = r.W;
      c.height = r.H;
      r.draw(c.getContext("2d")!, 0.5, SILENT, { poster: true, pageNumber, ageDays: age });
      try {
        return c.toDataURL("image/jpeg", 0.86);
      } catch {
        return "";
      }
    });
    queue = p.catch(() => undefined);
    cache.set(key, p);
  }
  return p;
}
