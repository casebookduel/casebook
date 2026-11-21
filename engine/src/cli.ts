#!/usr/bin/env node
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, runDuel } from "./duel.js";
import { checkSeal, fetchNotebook, importNotebook, RPC, SEALS, SITE } from "./holmes.js";
import { runMcp } from "./mcp.js";
import { describe, rank, Store, uplift } from "./store.js";

const version = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
const USAGE = `casebook-memory ${version}: memory for coding agents, with a receipt for every memory

  init [--local]            add the MCP server to this project (.mcp.json) and create .casebook/
  remember <text> [--tags a,b]
  recall <query> [--k 5]
  list [--all]              memories and their receipts (--all includes retired ones)
  show <id>                 one memory, its receipt and every event behind it
  outcome solved|failed     credit the memories served since the last outcome
  forget <id> [--reason r]  retire a memory
  index                     what the agent sees at the start of a session
  duel [file] [--runs n] [--ablate | --ablate=m1,m2]
                            run each task with and without memory (default file: casebook.duel.json)
  verify                    check the hash chain behind every receipt
  holmes [--yes]            Holmes's notebook from the duel, checked against its seal on Robinhood Chain, as memories
                            on probation (without --yes it only shows what it would store); --site, --seals, --rpc
  mcp                       run the MCP server on stdio

  --dir <path>              the .casebook folder (default: the nearest one, or CASEBOOK_DIR)`;

const opts: Record<string, string | true> = {}, pos: string[] = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) { pos.push(a); continue; }
  const [k, v] = a.slice(2).split(/=(.*)/s, 2);
  if (v !== undefined) opts[k] = v;
  else if (["all", "local", "ablate", "help", "json", "yes"].includes(k)) opts[k] = true;
  else opts[k] = argv[++i] ?? "";
}
const [cmd, ...rest] = pos;
// init sets up the folder it runs in; everything else uses the nearest store, like git
const store = opts.dir ? new Store(path.resolve(String(opts.dir))) : cmd === "init" && !process.env.CASEBOOK_DIR ? new Store(path.resolve(".casebook")) : Store.find();
const say = (s: string) => process.stdout.write(s + "\n");
const fail = (s: string): never => { process.stderr.write(s + "\n"); process.exit(1); };
const need = (s: string | undefined, what: string) => s || fail(`missing ${what}\n\n${USAGE}`);

switch (opts.help ? "help" : cmd) {
  case "mcp":
    runMcp(store, version);
    break;
  case "init": {
    const root = path.dirname(store.dir);
    fs.mkdirSync(store.dir, { recursive: true });
    const cfg = path.join(store.dir, "config.json");
    if (!fs.existsSync(cfg)) fs.writeFileSync(cfg, JSON.stringify({ budget: 500 }, null, 2) + "\n");
    fs.writeFileSync(path.join(store.dir, ".gitignore"), "duels/\n.lock\n");
    const server = opts.local
      ? { command: process.execPath, args: [fileURLToPath(import.meta.url), "mcp"] }
      : { command: "npx", args: ["-y", `casebook-memory@${version}`, "mcp"] };
    const file = path.join(root, ".mcp.json");
    let mcp: { mcpServers?: Record<string, unknown> } = {};
    if (fs.existsSync(file)) {
      try { mcp = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(`${file} is not valid JSON; fix it and run init again`); }
    }
    mcp.mcpServers = { ...(mcp.mcpServers ?? {}), casebook: server };
    fs.writeFileSync(file, JSON.stringify(mcp, null, 2) + "\n");
    say(`Memory store: ${store.dir}\nClaude Code: added "casebook" to ${file}. Restart Claude Code in this folder and approve the server.`);
    say(`Codex: add this to ~/.codex/config.toml\n\n[mcp_servers.casebook]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args)}\n`);
    say("Commit .casebook/log.jsonl if your team should share the memories; duel transcripts stay out of git.");
    break;
  }
  case "remember": {
    const r = store.remember(need(rest.join(" "), "the text to remember"), opts.tags ? String(opts.tags).split(",").map((t) => t.trim()).filter(Boolean) : [], "cli");
    if (r.error) fail(r.error);
    if (r.duplicate) say(`Already known as ${r.duplicate.id} (${r.duplicate.status}).`);
    else say(`Stored as ${r.id}, on probation.${r.conflicts.map((m) => `\nMay conflict with ${m.id}: ${m.text}`).join("")}`);
    break;
  }
  case "recall": {
    const found = store.recall(need(rest.join(" "), "a query"), Number(opts.k) || 5);
    say(found.length ? found.map(describe).join("\n\n") : "No memory matches that.");
    break;
  }
  case "list": {
    const ms = rank([...store.memories().values()].filter((m) => opts.all || m.status !== "retired"));
    if (opts.json) { say(JSON.stringify(ms, null, 2)); break; }
    if (!ms.length) { say("No memories yet."); break; }
    for (const m of ms) {
      const u = uplift(m), r = m.receipt;
      say(`${m.id.padEnd(5)} ${m.status.padEnd(9)} ${(u === null ? "not measured" : `uplift ${u >= 0 ? "+" : ""}${u.toFixed(2)} (${r.checks})`).padEnd(20)} used ${String(r.uses).padEnd(4)} ${r.solved}/${r.solved + r.failed} solved   ${m.text}`);
    }
    break;
  }
  case "show": {
    const id = need(rest[0], "a memory id");
    const m = store.memories().get(id) ?? fail(`No memory ${id}.`);
    say(describe(m));
    say(`created ${m.created} by ${m.source}${m.tags.length ? ` · tags ${m.tags.join(", ")}` : ""}\n`);
    for (const e of store.events()) {
      const d = e.data;
      const hit = d.id === id || (Array.isArray(d.ids) && d.ids.includes(id)) || (d.deltas && id in d.deltas) || (Array.isArray(d.conflicts) && d.conflicts.includes(id));
      if (!hit) continue;
      const what = e.type === "trial" ? `${d.kind} ${d.task}: ${d.deltas[id] > 0 ? "+" : ""}${d.deltas[id]}` : e.type === "serve" ? `served by ${d.via}${d.trial ? ` in ${d.trial}` : ""}` : e.type === "outcome" ? `outcome ${d.result}` : e.type === "status" ? `${d.status}: ${d.reason}` : e.type;
      say(`#${String(e.seq).padEnd(5)} ${e.at}  ${e.hash.slice(0, 12)}  ${what}`);
    }
    break;
  }
  case "outcome": {
    const result = rest[0] === "solved" || rest[0] === "failed" ? rest[0] : fail("outcome takes solved or failed");
    const ids = store.outcome(result, opts.ids ? String(opts.ids).split(",") : undefined);
    say(ids.length ? `Recorded ${result} for ${ids.join(", ")}.` : `Recorded ${result}; nothing was served since the last outcome.`);
    break;
  }
  case "forget": {
    const id = need(rest[0], "a memory id");
    if (!store.setStatus(id, "retired", `forgotten: ${opts.reason ? String(opts.reason) : "by hand"}`)) fail(`No memory ${id}.`);
    say(`Retired ${id}.`);
    break;
  }
  case "index":
    say(store.index().text);
    break;
  case "duel": {
    const file = path.resolve(rest[0] ?? "casebook.duel.json");
    if (!fs.existsSync(file)) fail(`No duel file at ${file}. Write one like:\n${JSON.stringify({ agent: "claude -p --mcp-config .mcp.json --allowedTools mcp__casebook", tasks: [{ id: "fix-dates", prompt: "Fix the failing date test.", check: "npm test -- dates" }] }, null, 2)}`);
    const c = readConfig(file);
    const ablate = opts.ablate === true ? "all" : typeof opts.ablate === "string" ? opts.ablate.split(",") : undefined;
    const r = await runDuel(store, c, path.dirname(file), { runs: Number(opts.runs) || undefined, ablate, log: say });
    say(`\nwith memory ${r.a}/${r.tasks}, without ${r.b}/${r.tasks}; only with memory ${r.onlyA}, only without ${r.onlyB}; two-sided sign test p = ${r.p < 0.0001 ? "< 0.0001" : r.p.toFixed(4)}`);
    for (const ch of r.changes) say(`${ch.id} is now ${ch.status}: ${ch.reason}`);
    say(`transcripts and result.json: ${r.dir}`);
    break;
  }
  case "verify": {
    const v = store.verify();
    if (!v.ok) fail(`broken: ${v.error}`);
    say(`ok: ${v.events} events, every hash checks out. head ${v.head}`);
    break;
  }
  case "holmes": {
    const site = String(opts.site || SITE).replace(/\/$/, ""), seals = String(opts.seals || SEALS), rpc = String(opts.rpc || RPC);
    const nb = await fetchNotebook(site).catch((e: Error) => fail(e.message));
    const check = await checkSeal(site, nb, seals, rpc);
    if (seals && !check.sealed) fail(`Refused: ${check.why}.`);   // a seal contract is known, so an unchecked notebook is not stored
    say(`Holmes's notebook after hour ${nb.hour}. Over the last ${nb.score.hours} hours Holmes got ${nb.score.holmes} of ${nb.score.n} right with it; Moriarty, with no notes, ${nb.score.moriarty}.`);
    say(check.sealed ? `Checked: hour ${nb.hour}'s bytes end with this notebook and hash to the root sealed on Robinhood Chain (${check.root.slice(0, 12)}…).` : `Not checked against the chain: ${check.why}.`);
    const r = importNotebook(store, nb, opts.yes === true);
    const merged = opts.yes ? r.add.length - r.stored.length : 0;   // near-duplicates of a memory already kept are merged, not stored again
    say(r.add.length ? `\n${opts.yes ? `Stored ${r.stored.length}` : `Would store ${r.add.length}`}, on probation${merged ? ` (${merged} merged as near-duplicates)` : ""}:\n${r.add.map((t) => `  + ${t}`).join("\n")}` : "\nNothing new to store.");
    if (r.drop.length) say(`\n${opts.yes ? "Retired" : "Would retire"} ${r.drop.length}, dropped from his notebook:\n${r.drop.map((m) => `  - ${m.id} ${m.text}`).join("\n")}`);
    if (!opts.yes && (r.add.length || r.drop.length)) say("\nNothing written yet. Run again with --yes to store these.");
    break;
  }
  default:
    say(USAGE);
    if (cmd && cmd !== "help") process.exitCode = 1;
}
