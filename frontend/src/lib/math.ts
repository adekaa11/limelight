export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smoothstep = (k: number) => {
  const x = clamp(k);
  return x * x * (3 - 2 * x);
};
export const easeOut = (k: number) => 1 - Math.pow(1 - clamp(k), 3);
export const easeInOut = (k: number) => {
  const x = clamp(k);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Количество элементов отсортированного массива, которые <= t (бинарный поиск). */
export function countLE(arr: number[], t: number) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
