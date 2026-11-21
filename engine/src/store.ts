// The memory store: one append-only, hash-chained event log per project (.casebook/log.jsonl). Every memory and every
// number on its receipt is replayed from that log, so `verify` can show that nothing was edited after the fact.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type Status = "probation" | "active" | "retired";
export type Receipt = {
  uses: number; // times the memory was put in an agent's context (the index or a recall)
  solved: number; // tasks reported solved while it was in context
  failed: number; // tasks reported failed while it was in context
  trials: number; // duel tasks it was in context for
  delta: number; // summed (memory on − memory off) score over those tasks; shared with every memory in context
  checks: number; // leave-one-out checks: the same task with all memories, then without this one
  lift: number; // summed (all memories − all but this one) score over those checks
  lastUsed: string | null;
  lastCheck: string | null;
};
export type Memory = { id: string; text: string; tags: string[]; created: string; source: string; status: Status; reason: string | null; conflicts: string[]; receipt: Receipt };
export type Event = { seq: number; at: string; type: string; data: Record<string, any>; prev: string; hash: string };

export const MIN_CHECKS = 3; // leave-one-out checks before a memory is promoted or retired
export const MAX_TEXT = 400;
export const DEFAULT_BUDGET = 500; // tokens for the always-loaded index
const GENESIS = "0".repeat(64);

const STOP = new Set("a an and are as at be by for from has have in into is it its of on or so that the then this to was were will with".split(" "));
const NEG = new Set(["not", "no", "never", "don't", "dont", "cannot", "can't", "without", "avoid"]);
const VALUE = /^(0x[0-9a-f]+|\d[\w.]*)$/;
export const tokens = (s: string) => s.toLowerCase().match(/0x[0-9a-f]+|[a-z0-9_]+(?:['.][a-z0-9_]+)*/g) ?? [];
const words = (s: string) => new Set(tokens(s).filter((t) => !STOP.has(t)));
const jaccard = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.max(1, a.size + b.size - n);
};

// Same words, same values and the same negation make a duplicate. Nearly the same words with other values, or with a
// negation only one side has, make a possible conflict ("call X with a 10k range" against "... a 5k range"). It is a
// word-level heuristic, so it only flags; nothing is blocked on it.
function parts(s: string) {
  const w = words(s);
  return { w, content: new Set([...w].filter((t) => !VALUE.test(t) && !NEG.has(t))), values: [...w].filter((t) => VALUE.test(t)).sort().join(" "), neg: [...w].some((t) => NEG.has(t)) };
}
export function relation(a: string, b: string): "duplicate" | "conflict" | null {
  const x = parts(a), y = parts(b);
  const same = x.values === y.values && x.neg === y.neg;
  if (same) return jaccard(x.w, y.w) >= 0.8 ? "duplicate" : null;
  if (x.content.size < 3 || y.content.size < 3 || jaccard(x.content, y.content) < 0.6) return null;
  return x.neg !== y.neg || (x.values !== "" && y.values !== "") ? "conflict" : null;
}
export const conflict = (a: string, b: string) => relation(a, b) === "conflict";

// Anything that looks like a credential is refused before it reaches the log.
const SECRETS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key block"],
  [/\b(?:sk|rk)-[A-Za-z0-9_-]{20,}/, "an API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}/, "a GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, "a JWT"],
  [/\b(?:private[ _-]?key|secret|mnemonic|seed)\b[^\n]{0,40}?\b(?:0x)?[0-9a-fA-F]{64}\b/i, "a private key"],
  [/(?<!0x)\b[0-9a-fA-F]{64}\b/, "a private key (64 hex characters without 0x; write the 0x if it is a hash)"],
  [/\b(?:mnemonic|seed phrase|recovery phrase)\b\W+(?:[a-z]+\s+){11,23}[a-z]+/i, "a seed phrase"],
  [/\b(?:api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*['"]?[^\s'"]{8,}/i, "a credential"],
];
export function secretIn(text: string): string | null {
  for (const [re, what] of SECRETS) if (re.test(text)) return what;
  return null;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const body = (e: Pick<Event, "seq" | "at" | "type" | "data">) => JSON.stringify({ seq: e.seq, at: e.at, type: e.type, data: e.data });
const blank = (): Receipt => ({ uses: 0, solved: 0, failed: 0, trials: 0, delta: 0, checks: 0, lift: 0, lastUsed: null, lastCheck: null });

function apply(mem: Map<string, Memory>, e: Event) {
  const d = e.data;
  if (e.type === "remember") {
    mem.set(d.id, { id: d.id, text: d.text, tags: d.tags ?? [], created: e.at, source: d.source ?? "agent", status: "probation", reason: null, conflicts: [...(d.conflicts ?? [])], receipt: blank() });
    for (const c of d.conflicts ?? []) mem.get(c)?.conflicts.push(d.id);
  } else if (e.type === "serve") {
    for (const id of d.ids) { const m = mem.get(id); if (m) { m.receipt.uses++; m.receipt.lastUsed = e.at; } }
  } else if (e.type === "outcome") {
    for (const id of d.ids) { const m = mem.get(id); if (m) m.receipt[d.result === "solved" ? "solved" : "failed"]++; }
  } else if (e.type === "trial") {
    for (const [id, v] of Object.entries(d.deltas as Record<string, number>)) {
      const m = mem.get(id);
      if (!m) continue;
      if (d.kind === "ablation") { m.receipt.checks++; m.receipt.lift += v; } else { m.receipt.trials++; m.receipt.delta += v; }
      m.receipt.lastCheck = e.at;
    }
  } else if (e.type === "status") {
    const m = mem.get(d.id);
    if (m) { m.status = d.status; m.reason = d.reason ?? null; }
  }
}

// measured uplift: the mean leave-one-out difference, or null before the first check
export const uplift = (m: Memory) => (m.receipt.checks ? m.receipt.lift / m.receipt.checks : null);
const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;

// active memories first (most measured uplift first), then the ones still on probation (most used first)
export function rank(ms: Memory[]): Memory[] {
  const n = (m: Memory) => Number(m.id.slice(1));
  return [...ms].sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || (uplift(b) ?? 0) - (uplift(a) ?? 0) || b.receipt.uses - a.receipt.uses || n(b) - n(a));
}

export function describe(m: Memory): string {
  const r = m.receipt, u = uplift(m);
  const bits = [`used ${r.uses} time${r.uses === 1 ? "" : "s"}`, `solved ${r.solved}, failed ${r.failed}`,
    u === null ? "uplift not measured yet" : `uplift ${signed(u)} over ${r.checks} check${r.checks === 1 ? "" : "s"}`, m.status + (m.reason ? ` (${m.reason})` : "")];
  if (m.conflicts.length) bits.push(`may conflict with ${m.conflicts.slice(0, 3).join(", ")}${m.conflicts.length > 3 ? ` and ${m.conflicts.length - 3} more` : ""}`);
  return `[${m.id}] ${m.text}\nreceipt: ${bits.join(" · ")}`;
}

function bm25(docs: string[][], q: string[]): number[] {
  const n = docs.length, avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, n);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const t of new Set(q)) {
      const f = tf.get(t) ?? 0;
      if (!f) continue;
      const k = df.get(t)!;
      s += Math.log(1 + (n - k + 0.5) / (k + 0.5)) * ((f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / avg)));
    }
    return s;
  });
}

// One writer at a time, across processes: two agent sessions may share a store.
function locked<T>(dir: string, f: () => T): T {
  const lock = path.join(dir, ".lock");
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(lock, String(process.pid), { flag: "wx" }); break; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) fs.rmSync(lock, { force: true }); } catch { /* gone already */ }
      if (i > 400) throw new Error(`casebook: the store is locked (${lock})`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return f(); } finally { fs.rmSync(lock, { force: true }); }
}

type Write<T> = { out: T; type?: string; data?: Record<string, unknown> };
export type Remembered = { id?: string; duplicate?: Memory; conflicts: Memory[]; error?: string };

export class Store {
  constructor(readonly dir: string) {}

  // CASEBOOK_DIR, else the nearest .casebook folder above `start`, else a new one in `start`
  static find(start = process.cwd(), env: NodeJS.ProcessEnv = process.env): Store {
    if (env.CASEBOOK_DIR) return new Store(path.resolve(env.CASEBOOK_DIR));
    for (let d = path.resolve(start); ; d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, ".casebook"))) return new Store(path.join(d, ".casebook"));
      if (path.dirname(d) === d) return new Store(path.join(path.resolve(start), ".casebook"));
    }
  }

  get logFile() { return path.join(this.dir, "log.jsonl"); }

  events(): Event[] {
    if (!fs.existsSync(this.logFile)) return [];
    const text = fs.readFileSync(this.logFile, "utf8");
    // only whole lines: a reader can catch a writer in the middle of the last one
    return text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map((l) => JSON.parse(l) as Event);
  }

  memories(): Map<string, Memory> {
    const mem = new Map<string, Memory>();
    for (const e of this.events()) apply(mem, e);
    return mem;
  }

  budget(): number {
    try { return Number(JSON.parse(fs.readFileSync(path.join(this.dir, "config.json"), "utf8")).budget) || DEFAULT_BUDGET; } catch { return DEFAULT_BUDGET; }
  }

  // read the state and append at most one event, under the lock
  private write<T>(f: (mem: Map<string, Memory>, events: Event[]) => Write<T>): T {
    fs.mkdirSync(this.dir, { recursive: true });
    return locked(this.dir, () => {
      const events = this.events(), mem = new Map<string, Memory>();
      for (const e of events) apply(mem, e);
      const r = f(mem, events);
      if (r.type) {
        const last = events.at(-1);
        const e = { seq: (last?.seq ?? 0) + 1, at: new Date().toISOString(), type: r.type, data: r.data ?? {}, prev: last?.hash ?? GENESIS, hash: "" };
        e.hash = sha(e.prev + "\n" + body(e));
        fs.appendFileSync(this.logFile, JSON.stringify(e) + "\n");
      }
      return r.out;
    });
  }

  remember(raw: string, tags: string[] = [], source = "agent"): Remembered {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return { error: "nothing to remember", conflicts: [] };
    if (text.length > MAX_TEXT) return { error: `too long (${text.length} characters, the limit is ${MAX_TEXT}): store one lesson per memory`, conflicts: [] };
    const secret = secretIn(text + " " + tags.join(" "));
    if (secret) return { error: `refused: it looks like ${secret}`, conflicts: [] };
    return this.write<Remembered>((mem) => {
      for (const m of mem.values()) if (relation(text, m.text) === "duplicate") return { out: { duplicate: m, conflicts: [] } };
      const conflicts = [...mem.values()].filter((m) => m.status !== "retired" && conflict(text, m.text));
      const id = `m${mem.size + 1}`;
      return { type: "remember", data: { id, text, tags, source, conflicts: conflicts.map((m) => m.id) }, out: { id, conflicts } };
    });
  }

  recall(query: string, k = 5, exclude: Set<string> = new Set()): Memory[] {
    const live = [...this.memories().values()].filter((m) => m.status !== "retired" && !exclude.has(m.id));
    const asked = new Set(query.split(/[\s,]+/));
    const byId = live.filter((m) => asked.has(m.id));
    if (byId.length) return byId;
    const q = tokens(query).filter((t) => !STOP.has(t));
    if (!q.length) return rank(live).slice(0, k);
    const score = bm25(live.map((m) => tokens(`${m.text} ${m.tags.join(" ")}`).filter((t) => !STOP.has(t))), q);
    return live.map((m, i) => ({ m, s: score[i] })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.m);
  }

  // what the agent sees at the start of every session, cut to a token budget (about 4 characters a token)
  index(budget = this.budget(), exclude: Set<string> = new Set()): { text: string; ids: string[] } {
    const live = rank([...this.memories().values()].filter((m) => m.status !== "retired" && !exclude.has(m.id)));
    if (!live.length) return { text: "Casebook memory is empty for this project. When you learn something reusable and checked (a command that works, a fact you verified), call remember. Call outcome with solved or failed when the task is done.", ids: [] };
    const head = `Casebook memory: ${live.length} lesson${live.length === 1 ? "" : "s"} from earlier tasks in this project. Use the ones that fit the task. Tools: recall (search them), remember (store a lesson you checked), outcome (solved or failed, when the task is done).`;
    const lines: string[] = [], ids: string[] = [];
    let size = head.length;
    for (const m of live) {
      const u = uplift(m);
      const line = `- [${m.id}] ${m.text}${m.status === "active" && u !== null ? ` (uplift ${signed(u)})` : ""}`;
      if (size + line.length + 1 > budget * 4) break;
      lines.push(line); ids.push(m.id); size += line.length + 1;
    }
    if (ids.length < live.length) lines.push(`- ${live.length - ids.length} more: call recall with a few words about the task.`);
    return { text: [head, ...lines].join("\n"), ids };
  }

  serve(ids: string[], via: "index" | "recall", trial?: string) {
    if (ids.length) this.write(() => ({ out: null, type: "serve", data: { ids, via, ...(trial ? { trial } : {}) } }));
  }

  // credit (or blame) the given memories, or everything served outside a duel since the last outcome
  outcome(result: "solved" | "failed", ids?: string[], note?: string): string[] {
    return this.write((mem, events) => {
      let use = ids;
      if (!use) {
        const from = events.findLastIndex((e) => e.type === "outcome") + 1;
        use = [...new Set(events.slice(from).filter((e) => e.type === "serve" && !e.data.trial).flatMap((e) => e.data.ids as string[]))];
      }
      use = use.filter((id) => mem.has(id));
      return { out: use, type: "outcome", data: { result, ids: use, ...(note ? { note } : {}) } };
    });
  }

  trial(task: string, kind: "presence" | "ablation", deltas: Record<string, number>) {
    if (Object.keys(deltas).length) this.write(() => ({ out: null, type: "trial", data: { task, kind, deltas } }));
  }

  setStatus(id: string, status: Status, reason: string): boolean {
    return this.write((mem) => (mem.has(id) ? { out: true, type: "status", data: { id, status, reason } } : { out: false }));
  }

  // promote memories that measurably help; retire the ones that hurt or do nothing
  judge(): { id: string; status: Status; reason: string }[] {
    const changes: { id: string; status: Status; reason: string }[] = [];
    for (const m of this.memories().values()) {
      const u = uplift(m);
      if (m.status === "retired" || u === null || m.receipt.checks < MIN_CHECKS) continue;
      const status: Status = u > 0 ? "active" : "retired";
      if (status === m.status) continue;
      const of = `over ${m.receipt.checks} checks`;
      const reason = u > 0 ? `helped: uplift ${signed(u)} ${of}` : u < 0 ? `hurt: uplift ${signed(u)} ${of}` : `no effect ${of}`;
      this.setStatus(m.id, status, reason);
      changes.push({ id: m.id, status, reason });
    }
    return changes;
  }

  verify(): { ok: boolean; events: number; head: string; error?: string } {
    let events: Event[];
    try { events = this.events(); } catch (e) { return { ok: false, events: 0, head: GENESIS, error: `the log does not parse: ${(e as Error).message}` }; }
    let prev = GENESIS;
    for (const [i, e] of events.entries()) {
      const at = `event ${i + 1}`;
      if (e.seq !== i + 1) return { ok: false, events: events.length, head: prev, error: `${at}: sequence number ${e.seq}` };
      if (e.prev !== prev) return { ok: false, events: events.length, head: prev, error: `${at}: does not follow the event before it` };
      if (sha(e.prev + "\n" + body(e)) !== e.hash) return { ok: false, events: events.length, head: prev, error: `${at}: its content does not match its hash` };
      prev = e.hash;
    }
    return { ok: true, events: events.length, head: prev };
  }
}
