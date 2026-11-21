import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { conflict, mcpHandler, readConfig, runDuel, secretIn, signTest, Store } from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "dist", "cli.js");
const fresh = () => new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "casebook-test-")), ".casebook"));

test("remember refuses secrets, keeps hashes, merges duplicates", () => {
  const s = fresh();
  assert.match(s.remember("use key sk-or-v1-abcdefghijklmnopqrstuvwxyz0123").error, /API key/);
  assert.match(s.remember(`wallet ${"ab".repeat(32)}`).error, /private key/);
  assert.match(s.remember(`private key: 0x${"cd".repeat(32)}`).error, /private key/);
  assert.match(s.remember("password = hunter2hunter2").error, /credential/);
  assert.equal(secretIn(`The launch event topic is 0x${"8d".repeat(32)}.`), null);
  const a = s.remember("Query eth_getLogs in ranges under 10000 blocks; larger ranges fail on this RPC.");
  assert.equal(a.id, "m1");
  assert.equal(s.remember("Query eth_getLogs in ranges under 10000 blocks, larger ranges fail on this RPC").duplicate.id, "m1");
  assert.match(s.remember("x".repeat(401)).error, /too long/);
});

test("conflicting values and negations are flagged on both memories", () => {
  assert.ok(conflict("Call getLogs with a range under 10000 blocks on this RPC", "Call getLogs with a range under 5000 blocks on this RPC"));
  assert.ok(conflict("Run the migrations before the tests start", "Never run the migrations before the tests start"));
  assert.ok(!conflict("The launch event topic is 0x8d4a", "The graduation event topic is 0x0a44"));
  const s = fresh();
  s.remember("Call getLogs with a range under 10000 blocks on this RPC");
  const r = s.remember("Call getLogs with a range under 5000 blocks on this RPC");
  assert.deepEqual(r.conflicts.map((m) => m.id), ["m1"]);
  assert.deepEqual(s.memories().get("m1").conflicts, ["m2"]);
});

test("recall ranks by relevance and finds ids", () => {
  const s = fresh();
  s.remember("The token's curve address comes from curve() with selector 0x7165485d.", ["rpc"]);
  s.remember("Run npm test with --runInBand or the database tests collide.");
  s.remember("creatorTaxBps() on the curve returns the creator tax in basis points.");
  assert.equal(s.recall("which selector gives the curve address")[0].id, "m1");
  assert.equal(s.recall("tests collide database")[0].id, "m2");
  assert.deepEqual(s.recall("m3").map((m) => m.id), ["m3"]);
  assert.deepEqual(s.recall("zebra"), []);
});

test("the index keeps to its token budget", () => {
  const s = fresh();
  for (let i = 0; i < 40; i++) s.remember(`Lesson number ${i}: module ${i} needs flag --mode-${i} before its build step runs.`);
  const ix = s.index(200);
  assert.ok(ix.text.length <= 200 * 4 + 80, `index is ${ix.text.length} characters`);
  assert.ok(ix.ids.length > 0 && ix.ids.length < 40);
  assert.match(ix.text, /more: call recall/);
});

test("outcomes credit what was served since the last outcome", () => {
  const s = fresh();
  s.remember("Lesson one about the build cache and its folder.");
  s.remember("Lesson two about the release script and its flags.");
  s.serve(["m1"], "index");
  s.serve(["m2"], "recall");
  assert.deepEqual(s.outcome("solved"), ["m1", "m2"]);
  s.serve(["m2"], "recall");
  assert.deepEqual(s.outcome("failed"), ["m2"]);
  const r = s.memories().get("m2").receipt;
  assert.deepEqual([r.uses, r.solved, r.failed], [2, 1, 1]);
});

test("judge promotes helpers and retires memories that hurt or do nothing", () => {
  const s = fresh();
  s.remember("Helpful lesson about the deploy order of services.");
  s.remember("Harmful lesson about skipping the schema check entirely.");
  s.remember("Idle lesson about the colour of the logs output.");
  for (let i = 0; i < 3; i++) s.trial(`t${i}`, "ablation", { m1: 1, m2: -1, m3: 0 });
  const ch = Object.fromEntries(s.judge().map((c) => [c.id, c]));
  assert.equal(ch.m1.status, "active");
  assert.match(ch.m1.reason, /helped: uplift \+1\.00 over 3 checks/);
  assert.match(ch.m2.reason, /hurt/);
  assert.match(ch.m3.reason, /no effect/);
  assert.ok(!s.index().ids.includes("m2"));
});

test("verify catches an edited or deleted event", () => {
  const s = fresh();
  s.remember("First lesson about the staging database.");
  s.remember("Second lesson about the queue worker restarts.");
  s.serve(["m1", "m2"], "index");
  assert.ok(s.verify().ok);
  const lines = fs.readFileSync(s.logFile, "utf8").split("\n").filter(Boolean);
  fs.writeFileSync(s.logFile, lines.map((l, i) => (i === 0 ? l.replace("staging", "production") : l)).join("\n") + "\n");
  assert.match(s.verify().error, /event 1: its content does not match/);
  fs.writeFileSync(s.logFile, [lines[0], lines[2]].join("\n") + "\n");
  assert.ok(!s.verify().ok);
});

test("the MCP handler serves the index, and arm B gets nothing", () => {
  const s = fresh();
  s.remember("The answer to alpha is 42.");
  const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } };
  const a = mcpHandler(s, "test", { CASEBOOK_TRIAL: "t#1/A" })(init);
  assert.match(a.result.instructions, /\[m1\] The answer to alpha is 42/);
  assert.equal(a.result.protocolVersion, "2025-06-18");
  assert.deepEqual(s.events().at(-1).data, { ids: ["m1"], via: "index", trial: "t#1/A" });
  const h = mcpHandler(s, "test", { CASEBOOK_ARM: "B" });
  assert.equal(h(init).result.instructions, undefined);
  assert.equal(h({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "recall", arguments: { query: "alpha" } } }).result.content[0].text, "No memories.");
  assert.equal(h({ jsonrpc: "2.0", id: 3, method: "tools/list" }).result.tools.length, 4);
  assert.equal(h({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal(h({ jsonrpc: "2.0", id: 4, method: "nope" }).error.code, -32601);
  const t = mcpHandler(s, "test", { CASEBOOK_TRIAL: "t#1/A" });
  assert.match(t({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "remember", arguments: { text: "New lesson about the cache folder layout." } } }).result.content[0].text, /stay fixed/);
});

test("the MCP server speaks JSON-RPC over stdio", async () => {
  const s = fresh();
  s.remember("The release script needs the --tag flag.");
  const p = spawn(process.execPath, [cli, "mcp"], { env: { ...process.env, CASEBOOK_DIR: s.dir }, stdio: ["pipe", "pipe", "inherit"] });
  const lines = readline.createInterface({ input: p.stdout })[Symbol.asyncIterator]();
  const ask = async (msg) => { p.stdin.write(JSON.stringify(msg) + "\n"); return JSON.parse((await lines.next()).value); };
  const init = await ask({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  assert.equal(init.result.serverInfo.name, "casebook-memory");
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const got = await ask({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "remember", arguments: { text: "Deploys need the VPN on." } } });
  assert.match(got.result.content[0].text, /Stored as m2/);
  const out = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "outcome", arguments: { result: "solved" } } });
  assert.match(out.result.content[0].text, /Recorded solved for m1/);
  p.kill();
});

test("a duel measures memory, and leave-one-out checks sort helpers from passengers", async () => {
  const s = fresh();
  const root = path.dirname(s.dir);
  s.remember("The answer to alpha is 42.");
  s.remember("Tabs are preferred over spaces in this repository.");
  const file = path.join(root, "casebook.duel.json");
  fs.writeFileSync(file, JSON.stringify({ agent: `"${process.execPath}" "${path.join(here, "fake-agent.mjs")}"`, tasks: [{ id: "alpha", prompt: "What is the answer to alpha?", check: 'test "$(cat out_alpha.txt)" = 42' }], timeout: 60 }));
  const r = await runDuel(s, readConfig(file), root, { runs: 3, ablate: "all" });
  assert.deepEqual([r.a, r.b, r.onlyA, r.onlyB], [3, 0, 3, 0]);
  assert.ok(Math.abs(r.p - 0.25) < 1e-9);
  const m = s.memories();
  assert.equal(m.get("m1").status, "active");
  assert.equal(m.get("m2").status, "retired");
  assert.match(m.get("m2").reason, /no effect over 3 checks/);
  assert.deepEqual([m.get("m1").receipt.trials, m.get("m1").receipt.delta, m.get("m1").receipt.checks], [3, 3, 3]);
  assert.ok(s.verify().ok);
});

test("sign test", () => {
  assert.equal(signTest(0, 0), 1);
  assert.ok(Math.abs(signTest(3, 3) - 0.25) < 1e-9);
  assert.ok(signTest(49, 57) < 0.0001);
  assert.equal(signTest(5, 10), 1);
});
