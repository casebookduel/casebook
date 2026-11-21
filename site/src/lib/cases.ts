// Visitor cases: a visitor picks a token and a question, and both agents answer it live (m1/case.py). The runner
// saves every finished case under CASE_DIR; this file reads them and holds the limits. Cases are kept apart from the
// hourly record: they never change a score, a key or Holmes's notebook.
import fs from "node:fs";
import path from "node:path";
import { cacheLife } from "next/cache";
import { getDuel } from "./duel";
import { busyUntil } from "./window";

// Off until the owner turns it on: the page, its links and the API exist only with CASES_LIVE=1 at build time.
export const CASES_LIVE = process.env.CASES_LIVE === "1";
export const CASE_DIR = process.env.CASE_DIR || path.resolve(process.cwd(), "..", "m1", "cases");
export const CASE_RUNNER = path.resolve(process.cwd(), "..", "m1", "case.py");
export const FREE_PER_DAY = Number(process.env.CASE_FREE_PER_DAY || 3);
export const DAILY_USD = Number(process.env.CASE_DAILY_USD || 2);   // all visitors together; cases stop for the day after it
export const MAX_RUNNING = 1;
export const START_GAP_S = 15;          // at least this long between two case starts, for everyone together
export const STARTS_PER_DAY = 12;       // starts per visitor a day, skips included; never given back
// the kinds m1/case.py can ask, in the order the form shows them
export const CASE_KINDS = ["snipers", "creator_sold", "first_buyer", "creator", "creator_launches", "graduated", "tax", "buys_100", "sells_1000", "grad_blocks", "launch_block"] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

export type CaseLine = { id: string; ts: number; token: string; kind: string; level: number; h: boolean; m: boolean; hc: number; mc: number; cost: number };
export type CaseStep = { tool: string; args: Record<string, unknown>; out: string };
export type CaseArm = { answer: string | null; ok: boolean; calls: number; trace: CaseStep[] };
export type CaseRecord = {
  id: string; ts: number; token: string; kind: string; level: number; calls: number; q: string; head: number; model: string;
  truth: string; evidence: Record<string, unknown>[]; checked: boolean; commit: string; salt: string;
  notes: { chars: number; sha256: string }; holmes: CaseArm; moriarty: CaseArm; cost: number;
};

export function caseLines(): CaseLine[] {
  const file = path.join(CASE_DIR, "cases.jsonl");
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map((l) => JSON.parse(l) as CaseLine);
}

const utcDay = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
// Today's model spend on cases, from the ledger case.py appends after every model call, so a case that is killed
// halfway still counts. Known limit: reread whole; rotate the ledger if it ever grows past a few MB.
export const spentToday = () => {
  const file = path.join(CASE_DIR, "spend.jsonl");
  if (!fs.existsSync(file)) return 0;
  const today = utcDay(Date.now() / 1000), text = fs.readFileSync(file, "utf8");
  return text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean)
    .reduce((s, l) => { const r = JSON.parse(l) as { ts: number; usd: number }; return utcDay(r.ts) === today ? s + (r.usd || 0) : s; }, 0);
};

// The hourly duel shares this server's IP and the public RPC with every case, and the RPC rate-limits by IP. So cases
// pause while an hour is played: from 3 minutes before the next hour is due until 3 minutes after it should be graded,
// and whenever the latest hour has rows but no notes yet. Returns when cases reopen (unix seconds), or null.
export async function duelBusy(now = Date.now() / 1000): Promise<number | null> {
  const d = await getDuel(), h = d.latest;
  return h ? busyUntil(h.ts, d.updated, d.notes.some((n) => n.hour === h.hour), now) : null;
}

// The running tally of visitor cases and the latest ones, refreshed like the duel data
export async function getCases() {
  "use cache";
  cacheLife("minutes");
  const ls = caseLines();
  return {
    n: ls.length, holmes: ls.filter((l) => l.h).length, moriarty: ls.filter((l) => l.m).length,
    recent: ls.slice(-12).reverse(),
  };
}

export async function getCase(id: string): Promise<CaseRecord | null> {
  "use cache";
  cacheLife("minutes");
  if (!/^[0-9a-f]{8,24}$/.test(id)) return null;
  const file = path.join(CASE_DIR, "cases", `${id}.json`);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as CaseRecord) : null;
}
