import { useEffect, useState } from "react";
import { listDays } from "../api";
import type { Day } from "../types";

export function useDays() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listDays().then(setDays, (e: Error) => setError(e.message));
  }, []);
  return { days, error };
}

/** Номер страницы = порядковый номер дня в дневнике (по дате, с первого). */
export function pageNumbers(days: Day[]) {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1));
  return new Map(sorted.map((d, i) => [d.id, i + 1]));
}
