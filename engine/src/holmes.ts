// Holmes's notebook, for your agent. Fetches the notebook Holmes wrote after his latest sealed hour on the duel's site,
// checks it against that hour's seal on Robinhood Chain (the hour's bytes must hash to the root on chain and end with
// the notebook, byte for byte), and stores each line as a memory on probation, with the hour as its source. Running it
// again stores the new lines and retires the ones Holmes has dropped since. Nothing is written without --yes.
import { createHash } from "node:crypto";
import { MAX_TEXT, type Store } from "./store.js";

export const SITE = "https://casebookduel.com";
export const RPC = "https://rpc.mainnet.chain.robinhood.com";
export const SEALS = "0x0A544A9698BA35964706f40618D43cdCC355aD3A";   // CasebookSeals on Robinhood Chain (21 Nov 2026); --seals overrides it
export const SEALS_SELECTOR = "0x286b25a4";    // seals(uint256); the site's tests check it against viem
export const TAGS = ["robinhood-chain", "casebook-holmes"];
const SOURCE = "casebook:hour";

export type Notebook = { hour: number; notes: string; lines: { text: string; wrong: boolean }[]; score: { holmes: number; moriarty: number; n: number; hours: number } };
export type SealCheck = { sealed: true; root: string } | { sealed: false; why: string };

export async function fetchNotebook(site: string): Promise<Notebook> {
  const r = await fetch(`${site}/data/notebook.json`);
  if (r.status === 404) throw new Error(`Holmes's notebook is not open on ${site} yet.`);
  if (!r.ok) throw new Error(`${site}/data/notebook.json: HTTP ${r.status}`);
  return (await r.json()) as Notebook;
}

export async function checkSeal(site: string, nb: Notebook, seals: string, rpc: string): Promise<SealCheck> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(seals)) return { sealed: false, why: "no seal contract known" };
  const r = await fetch(`${site}/data/seal/${nb.hour}`);
  if (!r.ok) return { sealed: false, why: `hour ${nb.hour}: the site does not serve its sealed bytes` };
  const bytes = Buffer.from(await r.arrayBuffer());
  const call = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: seals, data: SEALS_SELECTOR + nb.hour.toString(16).padStart(64, "0") }, "latest"] }) });
  const root = String(((await call.json()) as { result?: string }).result ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(root) || /^0x0{64}$/.test(root)) return { sealed: false, why: `hour ${nb.hour} has no seal on chain` };
  if (root !== "0x" + createHash("sha256").update(bytes).digest("hex")) return { sealed: false, why: `hour ${nb.hour}: the bytes do not match the seal` };
  if (!bytes.toString("utf8").endsWith(nb.notes)) return { sealed: false, why: `hour ${nb.hour}: this notebook is not the one that was sealed` };
  return { sealed: true, root };
}

// One memory per fact or procedure. A line ending in ":" is a heading and gives the lines under it their context;
// lines the site marks wrong on chain (an event the factory never emits) are left out.
export function memoriesFrom(nb: Notebook): string[] {
  let heading = "";
  const out: string[] = [];
  for (const { text, wrong } of nb.lines) {
    const t = text.trim();
    if (!t) continue;
    if (t.endsWith(":")) { heading = t.slice(0, -1).trim(); continue; }
    if (wrong) continue;
    const m = `Robinhood Chain${heading && heading.toUpperCase() !== "NOTES" ? `, ${heading.toLowerCase()}` : ""}: ${t.replace(/^[-*]\s*/, "")}`;
    out.push(m.length > MAX_TEXT ? m.slice(0, MAX_TEXT - 1) + "…" : m);
  }
  return [...new Set(out)];
}

export type Imported = { add: string[]; drop: { id: string; text: string }[]; stored: string[] };

export function importNotebook(store: Store, nb: Notebook, write: boolean): Imported {
  const texts = memoriesFrom(nb), keep = new Set(texts);
  const current = [...store.memories().values()].filter((m) => m.source.startsWith(SOURCE) && m.status !== "retired");
  const have = new Set(current.map((m) => m.text));
  const add = texts.filter((t) => !have.has(t)), drop = current.filter((m) => !keep.has(m.text)).map((m) => ({ id: m.id, text: m.text }));
  const stored: string[] = [];
  if (write) {
    for (const t of add) { const r = store.remember(t, TAGS, `${SOURCE}${nb.hour}`); if (r.id) stored.push(r.id); }
    for (const m of drop) store.setStatus(m.id, "retired", `dropped from Holmes's notebook by hour ${nb.hour}`);
  }
  return { add, drop, stored };
}
