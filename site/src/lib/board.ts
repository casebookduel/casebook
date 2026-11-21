// The league board's order: played notebooks by their share right (more questions first on a tie), then the queue,
// then the notebooks refused by the rules.
export type Ranked = { id: number; status: string; right: number; n: number };

export function boardOrder<T extends Ranked>(entries: T[]): T[] {
  const share = (e: T) => (e.n ? e.right / e.n : -1), group = (e: T) => (e.n ? 0 : e.status === "filtered" ? 2 : 1);
  return [...entries].sort((a, b) => group(a) - group(b) || share(b) - share(a) || b.n - a.n || a.id - b.id);
}
