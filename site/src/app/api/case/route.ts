// Runs one visitor case and streams it as it happens, one JSON object per line (see m1/case.py for the events).
// GET says how many free cases this visitor has left today and whether cases are open right now.
// Limits, all checked before anything runs:
// - FREE_PER_DAY cases per visitor (HOLDER_CASES for a signed-in holder); a case that ends before any model call
//   (a skip, a token that is not a launch) gives its case back;
// - STARTS_PER_DAY starts per visitor, skips included, never given back, so skips cannot loop on the shared RPC;
// - one case at a time and START_GAP_S between starts, for everyone together;
// - DAILY_USD of model spend for everyone, from the per-call ledger;
// - no case while the hourly duel is playing an hour (it shares this server's IP with the public RPC).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { CASE_DIR, CASE_KINDS, CASE_RUNNER, CASES_LIVE, DAILY_USD, duelBusy, FREE_PER_DAY, MAX_RUNNING, START_GAP_S, STARTS_PER_DAY, spentToday } from "@/lib/cases";
import { DIR } from "@/lib/duel";
import { HOLDER_CASES, holderFrom, stillHolds } from "@/lib/holder";
import { clientKey, sameOrigin, smallJson } from "@/lib/request";

// Known limit: in-memory counts for one server process; a restart resets them. A shared store if there is ever more than one.
const used = new Map<string, { day: string; n: number }>();
const starts = new Map<string, { day: string; n: number }>();
const SALT = crypto.randomBytes(16).toString("hex");
let running = 0, lastStart = 0;

const today = () => new Date().toISOString().slice(0, 10);
const count = (m: Map<string, { day: string; n: number }>, k: string) => { const u = m.get(k); return u?.day === today() ? u.n : 0; };
const bump = (m: Map<string, { day: string; n: number }>, k: string, by: number) => {
  if (m.size > 20_000) for (const [key, v] of m) if (v.day !== today()) m.delete(key);   // yesterday's entries
  m.set(k, { day: today(), n: Math.max(0, count(m, k) + by) });
};
const json = (o: unknown, status = 200) => Response.json(o, { status, headers: { "cache-control": "no-store" } });

// a signed-in holder who still holds counts by wallet, with the holder limit; anyone else by a daily hash of their address
async function quota(req: Request) {
  const visitor = crypto.createHash("sha256").update(`${today()}|${clientKey(req)}|${SALT}`).digest("hex").slice(0, 20);
  const holder = holderFrom(req);
  if (holder && (await stillHolds(holder))) return { who: `h:${holder}`, visitor, limit: HOLDER_CASES, holder };
  return { who: visitor, visitor, limit: FREE_PER_DAY, holder: null };
}

export async function GET(req: Request) {
  if (!CASES_LIVE) return json({ error: "off" }, 404);
  const { who, limit, holder } = await quota(req);
  return json({ limit, left: Math.max(0, limit - count(used, who)), open: spentToday() < DAILY_USD, busy: running >= MAX_RUNNING, duel: await duelBusy(), holder });
}

export async function POST(req: Request) {
  if (!CASES_LIVE) return json({ error: "off" }, 404);
  if (!sameOrigin(req)) return json({ error: "origin" }, 403);
  const got = await smallJson<{ token?: unknown; kind?: unknown }>(req);
  if (!("body" in got)) return json({ error: "input" }, got.status);
  const token = String(got.body?.token ?? "").trim(), kind = String(got.body?.kind ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !(CASE_KINDS as readonly string[]).includes(kind)) return json({ error: "input" }, 400);
  const { who, visitor, limit } = await quota(req);
  if (count(used, who) >= limit) return json({ error: "quota", left: 0 }, 429);
  if (count(starts, visitor) >= STARTS_PER_DAY) return json({ error: "quota", left: 0 }, 429);
  if (spentToday() >= DAILY_USD) return json({ error: "budget" }, 503);
  const until = await duelBusy();
  if (until) return json({ error: "duel", until }, 503);
  if (running >= MAX_RUNNING || Date.now() - lastStart < START_GAP_S * 1000) return json({ error: "busy" }, 503);

  // reserved now, synchronously after the last await, so two tabs cannot both take the last case
  bump(used, who, 1);
  bump(starts, visitor, 1);
  running++;
  lastStart = Date.now();
  const child = spawn("python3", [CASE_RUNNER, token.toLowerCase(), kind], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", LANG: "C.UTF-8", PYTHONIOENCODING: "utf-8",
      OPENROUTER_API_KEY: process.env.CASE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "",
      DUEL_DIR: DIR, CASE_DIR, ...(process.env.OPENROUTER_URL ? { OPENROUTER_URL: process.env.OPENROUTER_URL } : {}) },
  });
  const killer = setTimeout(() => child.kill("SIGKILL"), 240_000);
  let started = false, err = "";
  child.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      let buf = "", open = true;
      const send = (line: string) => { if (!open) return; try { ctrl.enqueue(enc.encode(line + "\n")); } catch { open = false; } };   // the visitor may leave; the case still finishes and is saved
      child.stdout.on("data", (d) => {
        buf += d;
        if (buf.length > 1_000_000) buf = buf.slice(-100_000);   // a runaway line cannot grow without bound
        for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          try { if ((JSON.parse(line) as { t?: string }).t === "task") started = true; } catch { continue; }
          send(line);
        }
      });
      child.on("close", (code) => {
        clearTimeout(killer);
        running--;
        // nothing was spent before the "task" event (the key comes first): give the case back. After it, model calls
        // may have been paid for, so the case stays counted, finished or not.
        if (!started) bump(used, who, -1);
        if (code !== 0 && code !== 2) console.error(`case ${kind} ${token}: exit ${code}: ${err.split("\n").slice(-3).join(" | ")}`);
        send(JSON.stringify({ t: "end", code }));
        if (open) try { ctrl.close(); } catch {}
      });
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
