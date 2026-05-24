/**
 * Compare two dot-separated numeric version strings (e.g. "0.2.0").
 *
 * Returns true when `installed` is the same as or newer than `minimum`.
 * Comparison is per-segment numeric (so "0.10.0" > "0.9.0", unlike a string
 * compare). Missing trailing segments are treated as 0, so "0.2" === "0.2.0".
 * Non-numeric segments are coerced to 0 defensively rather than throwing.
 */
export function isAtLeastVersion(installed: string, minimum: string): boolean {
  const parse = (v: string): number[] =>
    v.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });

  const a = parse(installed);
  const b = parse(minimum);
  const len = Math.max(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }

  return true; // all segments equal
}
