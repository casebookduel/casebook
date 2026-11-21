// Reads the hourly duel's raw output (m0/out) and shapes it for the pages. Nothing here is computed by a model:
// answer keys come from the Pons factory logs inside the runner, and this file only groups and counts.
import fs from "node:fs";
import path from "node:path";
import { cacheLife } from "next/cache";
import en from "@/i18n/en";

export type Step = { tool: string; args: Record<string, unknown>; out: string };
export type Attempt = { answer: string | null; ok: boolean; calls: number; trace: Step[] };
// What a reader needs to check one answer key: the log it came from, the query that counted it, or the call that read it.
export type Evidence = { what: string; tx?: string; logIndex?: number; block?: number; address?: string; count?: number;
  getLogs?: { address: string; topics: string[]; fromBlock: number; toBlock: number }; eth_call?: { to: string; data: string } };
export type Task = { kind: string; q: string; truth: string; holmes: Attempt; moriarty: Attempt; level: number; retention: boolean; evidence: Evidence[] };
export type Hour = {
  hour: number; ts: number; head: number; model: string; tasks: Task[];
  holmes: number; moriarty: number; n: number; holmesCalls: number; moriartyCalls: number;
  rule: "v1" | "v2"; notesUsed: string | null; level: number;
  taught: number[];   // ids of the Taught lessons Holmes read this hour (their text is in the lessons contract's events)
};
export type Duel = {
  hours: Hour[]; latest: Hour | null; ruleV2From: number;
  since: { hours: number; holmes: number; moriarty: number; n: number; ahead: number; behind: number; tied: number };
  pairs: { holmesOnly: number; moriartyOnly: number; p: number };
  notes: { hour: number; text: string }[];
  updated: number;
  // present once the runner plays levels (m1): the current level, when each began, and Holmes's run toward the next
  levels: null | { current: number; since: number; history: { level: number; from_hour: number }[]; pct: number; hours: number };
  missed: { hour: number; why: string }[];
};

export const DIR = process.env.DUEL_DIR || path.resolve(process.cwd(), "..", "m0", "out");

type Row = { hour: number; ts: number; head: number; model: string; kind: string; q: string; truth: string; arm: "A" | "B";
  answer: string | null; ok: boolean; calls: number; trace: Step[]; level?: number; retention?: boolean; evidence?: Evidence[] | ""; taught?: number[] };

function signTest(a: number, b: number): number {
  const n = a + b, k = Math.max(a, b);
  if (!n) return 1;
  let s = 0, c = 1;                                   // c = C(n, j), built up from j = 0
  for (let j = 0; j <= n; j++) { if (j >= k) s += c; c = (c * (n - j)) / (j + 1); }
  return Math.min(1, (2 * s) / 2 ** n);
}

// The runner appends while the site reads, so a read can end inside a row; keep whole lines only.
const complete = (s: string) => s.slice(0, s.lastIndexOf("\n") + 1);

export function loadDuel(): Duel {
  const file = path.join(DIR, "results.jsonl");
  const rows: Row[] = fs.existsSync(file)
    ? complete(fs.readFileSync(file, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const log = fs.existsSync(path.join(DIR, "run.log")) ? fs.readFileSync(path.join(DIR, "run.log"), "utf8") : "";
  const v2 = /reflection prompt v2 from hour (\d+)/.exec(log);
  const ruleV2From = v2 ? Number(v2[1]) : 0;

  const byHour = new Map<number, Row[]>();
  for (const r of rows) byHour.set(r.hour, [...(byHour.get(r.hour) || []), r]);
  const note = (h: number) => {
    const f = path.join(DIR, `notes_h${String(h).padStart(2, "0")}.md`);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : null;
  };

  const hours: Hour[] = [...byHour.keys()].sort((a, b) => a - b).map((h) => {
    const rs = byHour.get(h)!;
    const tasks: Task[] = [];
    for (const r of rs.filter((x) => x.arm === "A")) {
      const m = rs.find((x) => x.arm === "B" && x.q === r.q);
      const att = (x?: Row): Attempt => ({ answer: x?.answer ?? null, ok: !!x?.ok, calls: x?.calls ?? 0, trace: x?.trace ?? [] });
      tasks.push({ kind: r.kind, q: r.q, truth: r.truth, holmes: att(r), moriarty: att(m), level: r.level ?? 1, retention: !!r.retention, evidence: Array.isArray(r.evidence) ? r.evidence : [] });
    }
    const sum = (f: (t: Task) => number) => tasks.reduce((s, t) => s + f(t), 0);
    return {
      hour: h, ts: rs[0].ts, head: rs[0].head, model: rs[0].model, tasks,
      holmes: sum((t) => +t.holmes.ok), moriarty: sum((t) => +t.moriarty.ok), n: tasks.length,
      holmesCalls: sum((t) => t.holmes.calls) / Math.max(1, tasks.length), moriartyCalls: sum((t) => t.moriarty.calls) / Math.max(1, tasks.length),
      rule: h >= ruleV2From ? "v2" : "v1", notesUsed: h > 0 ? note(h - 1) : null,
      level: Math.max(1, ...tasks.filter((t) => !t.retention).map((t) => t.level)),
      taught: rs.find((x) => x.arm === "A" && Array.isArray(x.taught))?.taught ?? [],
    };
  });

  const after = hours.filter((h) => h.rule === "v2");
  let holmesOnly = 0, moriartyOnly = 0;
  for (const h of after) for (const t of h.tasks) { if (t.holmes.ok && !t.moriarty.ok) holmesOnly++; if (t.moriarty.ok && !t.holmes.ok) moriartyOnly++; }
  const notes = hours.map((h) => ({ hour: h.hour, text: note(h.hour) })).filter((x): x is { hour: number; text: string } => !!x.text);

  // the unlock rule, read the runner's way (m1/duel.py unlock): Holmes's share of right answers on the current level's
  // own questions over the last 12 hours played at that level (90% opens the next one). Like the runner, this does not
  // start at since_hour: the seeded M0 hours read as level 1, so they count toward level 1's twelve.
  let levels: Duel["levels"] = null;
  const lf = path.join(DIR, "level.json");
  if (fs.existsSync(lf)) {
    const st = JSON.parse(fs.readFileSync(lf, "utf8")) as { level: number; since_hour: number; history: { level: number; from_hour: number }[] }; // written by rename, so never half-written
    const at = hours.filter((h) => h.level === st.level).slice(-12);
    const qs = at.flatMap((h) => h.tasks.filter((t) => !t.retention && t.level === st.level));
    levels = { current: st.level, since: st.since_hour, history: st.history, pct: qs.length ? Math.round((100 * qs.filter((t) => t.holmes.ok).length) / qs.length) : 0, hours: at.length };
  }

  // hour numbers between the first and the last that hold no results: listed, never skipped. The runner's log line is
  // the reason when it has one, with anything that looks like a URL or a token cut out.
  const failed = new Map([...log.matchAll(/^\S+ \S+ hour (\d+) failed: (.*)$/gm)].map((m) => [Number(m[1]), m[2]]));
  const clean = (s: string) => s.replace(/https?:\/\/\S+/g, "<url>").replace(/[A-Za-z0-9_-]{24,}/g, "…").slice(0, 120);
  const missed = hours.length < 2 ? [] : Array.from({ length: hours.at(-1)!.hour - hours[0].hour + 1 }, (_, i) => hours[0].hour + i)
    .filter((h) => !byHour.has(h)).map((h) => ({ hour: h, why: failed.has(h) ? clean(failed.get(h)!) : "no results were written" }));

  return {
    hours, latest: hours.at(-1) ?? null, ruleV2From, levels, missed,
    since: {
      hours: after.length, holmes: after.reduce((s, h) => s + h.holmes, 0), moriarty: after.reduce((s, h) => s + h.moriarty, 0),
      n: after.reduce((s, h) => s + h.n, 0), ahead: after.filter((h) => h.holmes > h.moriarty).length,
      behind: after.filter((h) => h.holmes < h.moriarty).length, tied: after.filter((h) => h.holmes === h.moriarty).length,
    },
    pairs: { holmesOnly, moriartyOnly, p: signTest(holmesOnly, moriartyOnly) },
    notes, updated: rows.length ? Math.max(...rows.map((r) => r.ts)) : 0,
  };
}

export const KIND_LABEL: Record<string, string> = en.kinds;

export const short = (s: string | null, n = 14) => (!s ? "no answer" : s.startsWith("0x") && s.length > n ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

// The pages read the duel through this: one disk read a minute at most, shared by every page.
export async function getDuel(): Promise<Duel> {
  "use cache";
  cacheLife("minutes");
  return loadDuel();
}

// The raw file, cached the same way, so /data/results.jsonl refreshes with the pages instead of freezing at build time.
export async function rawResults(): Promise<string> {
  "use cache";
  cacheLife("minutes");
  const file = path.join(DIR, "results.jsonl");
  return fs.existsSync(file) ? complete(fs.readFileSync(file, "utf8")) : "";
}

export { EXPLORER } from "./explorer";

// Where each answer key comes from, in the runner's own terms.
export const KEY_SOURCE: Record<string, string> = {
  creator: "The creator topic of the factory's launch event for this token.",
  curve: "The curve topic of the factory's launch event for this token.",
  launch_block: "The block of the factory's launch event for this token.",
  tax: "creatorTaxBps() (selector 0xc1bb8901), called on the token's curve contract.",
  count: "The factory's launch events inside that block range, counted.",
  graduated: "Yes if the factory emitted a graduation event for this token in the six hours before the question. The tokens asked about for a no all launched in the hour before.",
};

const DT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const TM = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
export const when = (ts: number) => `${DT.format(ts * 1000).replace(",", "")} UTC`;
export const clock = (ts: number) => `${TM.format(ts * 1000)} UTC`;
export const num = (n: number) => n.toLocaleString("en-US");

// Copied word for word from m0/duel.py, so the pages show exactly what the agents are told.
export const MODEL_LINE = "deepseek/deepseek-v4.1-flash, temperature 0";
export const RPC_METHODS = ["eth_blockNumber", "eth_call", "eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_getLogs", "eth_getTransactionByHash", "eth_getTransactionReceipt"];
export const SYSTEM_PROMPT = `You answer questions about Robinhood Chain (chain id 4663, an Arbitrum Orbit L2 making about 9-10 blocks a second) with read-only tools.
Pons is its main token launchpad. The Pons factory contract is 0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e. It creates every Pons token and emits an event when it does, and a different event when a token graduates from its bonding curve. Each token trades on its own bonding-curve contract until it graduates; the curve contract has a function creatorTaxBps().
Tools: rpc (read-only JSON-RPC), keccak (keccak-256 of a text such as a function or event signature), words (split hex data into 32-byte words), answer (your final answer).
You have at most 8 tool calls in total, and the answer call counts. Give only the value in the answer: an address, a number, or yes/no.`;
// M1's prompt (m1/duel.py BASE), used once the runner plays levels; the call budget depends on the level (8, 12 or 16).
export const SYSTEM_PROMPT_M1 = `You answer questions about Robinhood Chain (chain id 4663, an Arbitrum Orbit L2 making about 9-10 blocks a second) with read-only tools.
The questions are about tokens from the launchpad factory 0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e. It creates every one of these tokens and emits an event when it does, and a different event when a token graduates from its bonding curve. Each token trades on its own bonding-curve contract until it graduates; the curve contract has a function creatorTaxBps(), and it emits an event for every buy and every sell.
Tools: rpc (read-only JSON-RPC), keccak (keccak-256 of a text such as a function or event signature), words (split hex data into 32-byte words), answer (your final answer).
You have at most {calls} tool calls in total, and the answer call counts. Give only the value in the answer: an address, a number, or yes/no.`;
export const REFLECT_RULE = `Rewrite your notes for the next hour. The tokens and blocks will be different next hour, so keep only general facts and short procedures that this hour's results confirm and that would let you answer these kinds of questions correctly in fewer tool calls: contract addresses, event topics and which topic holds what, function selectors, block-range tips, mistakes to avoid. Drop anything that turned out wrong. Record an event topic or selector only if it appeared in a real tool result (for example topics[0] of a log you received) or a call with it returned data; never record a hash you computed for a guessed signature that matched nothing. At most 250 words. Output only the notes.`;

// Known limit: line-set diff, not a true LCS diff; fine for notes of a few dozen lines that get rewritten whole.
export { diffLines } from "./diff.ts";

// The compact shape the interactive panels get: every hour, every question, both answers. No step traces.
export type QRow = { level: number; retention: boolean; kind: string; label: string; q: string; truth: string; h: { a: string | null; ok: boolean; c: number }; m: { a: string | null; ok: boolean; c: number } };
export type HourLite = { hour: number; ts: number; holmes: number; moriarty: number; n: number; rule: "v1" | "v2"; level: number; rows: QRow[] };
export const lite = (d: Duel): HourLite[] => d.hours.map((h) => ({
  hour: h.hour, ts: h.ts, holmes: h.holmes, moriarty: h.moriarty, n: h.n, rule: h.rule, level: h.level,
  rows: h.tasks.map((t) => ({ level: t.level, retention: t.retention, kind: t.kind, label: KIND_LABEL[t.kind] ?? t.kind, q: t.q, truth: t.truth,
    h: { a: t.holmes.answer, ok: t.holmes.ok, c: t.holmes.calls }, m: { a: t.moriarty.answer, ok: t.moriarty.ok, c: t.moriarty.calls } })),
}));
