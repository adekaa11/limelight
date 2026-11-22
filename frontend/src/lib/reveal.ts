/** Проявление при прокрутке: .reveal получает .is-in, когда попадает в кадр.
 * Пока скрипт не запустился, элементы видны (класс reveal-ready ставится только здесь). */
export function startReveal(): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  document.documentElement.classList.add("reveal-ready");
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0.12 },
  );
  const scan = () => document.querySelectorAll(".reveal:not(.is-in)").forEach((el) => io.observe(el));
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });
  return () => {
    io.disconnect();
    mo.disconnect();
  };
}
