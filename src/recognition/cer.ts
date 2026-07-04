/** Levenshtein distance over Unicode code points. */
export function editDistance(a: string, b: string): number {
  const s = [...a];
  const t = [...b];
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[t.length];
}

/** Character error rate: 0 = perfect. Whitespace-normalized, capped at 1. */
export function cer(expected: string, actual: string): number {
  const e = expected.replace(/\s+/g, ' ').trim();
  const a = actual.replace(/\s+/g, ' ').trim();
  if (e.length === 0) return a.length === 0 ? 0 : 1;
  return Math.min(1, editDistance(e, a) / [...e].length);
}
