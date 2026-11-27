// Holmes's notes on a file: the few facts worth reading first, in plain words, from the file's numbers alone (no model).
// Each note has a tone: "bad" for what a buyer should weigh (a dev who launches all day, sold fast, never graduated, a
// sniper first in), "good" for a record of graduations (one launch in five or better), "plain" otherwise. Shared by the feed, the file page and the
// share card, so all three say the same thing.
import type { LaunchFile } from "./files";

export type NoteKey = "nSerial" | "nSerial7" | "nNoGrad" | "nGrad" | "nSold" | "nNoBuyers" | "nSniper" | "nFirst" | "nDevSold";
export type Note = { key: NoteKey; tone: "bad" | "good" | "plain"; v: Record<string, number> };   // "secs" becomes {t}, a duration

export const dur = (s: number) => (s < 90 ? { n: Math.round(s), u: "s" as const } : s < 5400 ? { n: Math.round(s / 60), u: "m" as const } : { n: Math.round(s / 3600), u: "h" as const });

export function notesOf(f: LaunchFile): Note[] {
  const c = f.creator_record, out: Note[] = [];
  if (c.n24 >= 3) out.push({ key: "nSerial", tone: "bad", v: { n: c.n24 } });
  else if (c.n7 >= 10) out.push({ key: "nSerial7", tone: "bad", v: { n: c.n7 } });
  if (f.dev_sell_s != null) out.push({ key: "nDevSold", tone: f.dev_sell_s <= 300 ? "bad" : "plain", v: { secs: f.dev_sell_s } });
  if (c.sold_on >= 2 && c.sold_median_s != null) out.push({ key: "nSold", tone: c.sold_median_s <= 300 ? "bad" : "plain", v: { s: c.sold_on, e: c.earlier, secs: c.sold_median_s } });
  if (c.grads > 0) out.push({ key: "nGrad", tone: c.grads * 5 >= c.n30 ? "good" : "plain", v: { n: c.grads, m: c.n30 } });   // good only when one in five or more made it
  else if (c.n30 >= 3) out.push({ key: "nNoGrad", tone: "bad", v: { n: c.n30 } });
  if (c.settled >= 3 && c.no_buyer * 2 >= c.settled) out.push({ key: "nNoBuyers", tone: "bad", v: { x: c.no_buyer, e: c.settled } });
  if (f.first_buyer_sniper) out.push({ key: "nSniper", tone: "bad", v: { r: f.first_buyer_sniper.rank, n: f.first_buyer_sniper.n } });
  if (c.n30 === 1) out.push({ key: "nFirst", tone: "plain", v: {} });
  return out;
}
