const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export const parseDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const formatDate = (iso: string) => {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Возраст записи в днях на момент просмотра. */
export const ageDays = (iso: string, now = new Date()) =>
  Math.max(0, Math.floor((now.getTime() - parseDate(iso).getTime()) / 86400000));

/**
 * Правило старения: выцветание растёт с возрастом записи и насыщается к ~2 годам.
 * 0 дней -> 0, месяц -> 0.07, полгода -> 0.37, год -> 0.6, 2 года -> 0.84.
 */
export const fadeForAge = (days: number) => 1 - Math.exp(-days / 400);
