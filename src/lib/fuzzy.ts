/**
 * Score how well `query` matches `text` as an in-order subsequence (case-insensitive).
 * Returns -1 for no match; higher is better. Rewards prefix, word-start and consecutive hits.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 300 - idx - t.length / 10;

  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    const wordStart = found === 0 || /[\s\-_/.(]/.test(t[found - 1]);
    score += (found === prev + 1 ? 8 : 1) + (wordStart ? 6 : 0);
    prev = found;
    ti = found + 1;
  }
  return score - t.length / 20;
}

export function fuzzyFilter<T>(items: T[], query: string, key: (item: T) => string, limit = 8): T[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(query, key(item)) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}
