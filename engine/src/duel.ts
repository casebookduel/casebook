// The duel: every task runs twice, with memory (A) and without (B), and is graded by the user's own check command.
// Optional leave-one-out runs measure single memories: A again without memory m; the difference is m's uplift.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Status, Store } from "./store.js";

export type Task = { id: string; prompt: string; check: string };
export type DuelConfig = { agent: string; tasks: Task[]; runs?: number; isolate?: "none" | "worktree"; setup?: string; timeout?: number };
export type Row = { task: string; run: number; a: boolean; b: boolean; served: string[]; without: Record<string, boolean> };
export type DuelResult = { tasks: number; a: number; b: number; onlyA: number; onlyB: number; p: number; changes: { id: string; status: Status; reason: string }[]; rows: Row[]; dir: string };

// exact two-sided sign test: x wins for one side out of n pairs that differ
export function signTest(x: number, n: number): number {
  if (n === 0) return 1;
  const lf = [0];
  for (let i = 1; i <= n; i++) lf.push(lf[i - 1] + Math.log(i));
  let p = 0;
  for (let i = 0; i <= Math.min(x, n - x); i++) p += Math.exp(lf[n] - lf[i] - lf[n - i] - n * Math.LN2);
  return Math.min(1, 2 * p);
}

export function readConfig(file: string): DuelConfig {
  const c = JSON.parse(fs.readFileSync(file, "utf8")) as DuelConfig;
  if (typeof c.agent !== "string" || !c.agent) throw new Error(`${file}: "agent" must be the command that runs your agent (it gets the prompt on stdin)`);
  if (!Array.isArray(c.tasks) || !c.tasks.length) throw new Error(`${file}: "tasks" must list at least one task`);
  const ids = new Set<string>();
  for (const t of c.tasks) {
    if (!t || typeof t.id !== "string" || typeof t.prompt !== "string" || typeof t.check !== "string") throw new Error(`${file}: every task needs "id", "prompt" and "check"`);
    if (ids.has(t.id)) throw new Error(`${file}: task id "${t.id}" is used twice`);
    ids.add(t.id);
  }
  return c;
}

function sh(cmd: string, o: { cwd: string; env: NodeJS.ProcessEnv; input?: string; timeout: number; out?: string }): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn("sh", ["-c", cmd], { cwd: o.cwd, env: o.env, stdio: ["pipe", "pipe", "pipe"], detached: true });
    const chunks: Buffer[] = [];
    p.stdout.on("data", (b: Buffer) => chunks.push(b));
    p.stderr.on("data", (b: Buffer) => chunks.push(b));
    p.stdin.on("error", () => { /* the command did not read its input */ });
    const kill = setTimeout(() => { try { process.kill(-p.pid!, "SIGKILL"); } catch { /* already gone */ } }, o.timeout * 1000);
    p.on("close", (code) => {
      clearTimeout(kill);
      if (o.out) fs.writeFileSync(o.out, Buffer.concat(chunks));
      resolve(code ?? 1);
    });
    p.stdin.end(o.input ?? "");
  });
}

// a clean checkout per run when the tasks change files, so arm A's edits never reach arm B
function workspace(c: DuelConfig, root: string): { cwd: string; done: () => void } {
  if (c.isolate !== "worktree") return { cwd: root, done: () => {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "casebook-duel-"));
  const r = spawnSync("git", ["worktree", "add", "--detach", dir, "HEAD"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git worktree add failed: ${r.stderr.trim()}`);
  return { cwd: dir, done: () => { spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: root }); } };
}

export async function runDuel(store: Store, c: DuelConfig, root: string, o: { runs?: number; ablate?: "all" | string[]; log?: (s: string) => void } = {}): Promise<DuelResult> {
  const runs = o.runs ?? c.runs ?? 1, timeout = c.timeout ?? 900, log = o.log ?? (() => {});
  const dir = path.join(store.dir, "duels", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });

  const play = async (t: Task, trial: string, arm: "A" | "B", exclude: string[]) => {
    const w = workspace(c, root);
    try {
      const env = { ...process.env, CASEBOOK_DIR: store.dir, CASEBOOK_ARM: arm, CASEBOOK_TRIAL: trial, CASEBOOK_EXCLUDE: exclude.join(",") };
      if (c.setup && c.isolate === "worktree") await sh(c.setup, { cwd: w.cwd, env, timeout });
      await sh(c.agent, { cwd: w.cwd, env, input: t.prompt, timeout, out: path.join(dir, `${trial.replace(/[^\w.-]+/g, "_")}.log`) });
      return (await sh(t.check, { cwd: w.cwd, env, timeout })) === 0;
    } finally { w.done(); }
  };
  const servedIn = (trial: string) => [...new Set(store.events().filter((e) => e.type === "serve" && e.data.trial === trial).flatMap((e) => e.data.ids as string[]))];

  const rows: Row[] = [];
  for (let run = 1; run <= runs; run++) {
    for (const t of c.tasks) {
      const tag = `${t.id}#${run}`;
      const a = await play(t, `${tag}/A`, "A", []);
      const b = await play(t, `${tag}/B`, "B", []);
      const served = servedIn(`${tag}/A`);
      store.trial(t.id, "presence", Object.fromEntries(served.map((id) => [id, Number(a) - Number(b)])));
      const without: Record<string, boolean> = {};
      for (const id of served.filter((id) => o.ablate === "all" || (Array.isArray(o.ablate) && o.ablate.includes(id)))) {
        without[id] = await play(t, `${tag}/A-${id}`, "A", [id]);
      }
      store.trial(t.id, "ablation", Object.fromEntries(Object.entries(without).map(([id, w]) => [id, Number(a) - Number(w)])));
      rows.push({ task: t.id, run, a, b, served, without });
      log(`${tag.padEnd(24)} with memory ${a ? "pass" : "fail"}  without ${b ? "pass" : "fail"}${served.length ? `  in context: ${served.join(", ")}` : ""}`);
    }
  }
  const changes = store.judge();
  const onlyA = rows.filter((r) => r.a && !r.b).length, onlyB = rows.filter((r) => r.b && !r.a).length;
  const result: DuelResult = { tasks: rows.length, a: rows.filter((r) => r.a).length, b: rows.filter((r) => r.b).length, onlyA, onlyB, p: signTest(onlyA, onlyA + onlyB), changes, rows, dir };
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}
