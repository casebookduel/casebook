// Line diff of two notebook versions: dropped lines first, then the new version with each line marked as kept or added.
// Order inside a version is ignored on purpose: Holmes rewrites the whole notebook every hour.
export type DiffRow = { l: string; k: "del" | "same" | "add" };

export function diffLines(prev: string, next: string): DiffRow[] {
  const a = prev.split("\n").map((l) => l.trimEnd()).filter(Boolean), b = next.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  const A = new Set(a), B = new Set(b);
  return [...a.filter((l) => !B.has(l)).map((l): DiffRow => ({ l, k: "del" })), ...b.map((l): DiffRow => ({ l, k: A.has(l) ? "same" : "add" }))];
}
