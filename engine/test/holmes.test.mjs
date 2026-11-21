import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkSeal, importNotebook, memoriesFrom, SEALS_SELECTOR, Store } from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "dist", "cli.js");
const SEALS = "0x" + "5e".repeat(20);
const fresh = () => new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "casebook-holmes-")), ".casebook"));

const NOTES = [
  "NOTES:",
  "Pons factory: 0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e. Query eth_getLogs here for creation events.",
  "Procedures:",
  "- Token→curve: eth_call token 0x7165485d.",
  "- Creator tax: eth_call curve 0xc1bb8901.",
  "- TokenGraduated: topic0 = 0x" + "da".repeat(32) + ".",
  "",
].join("\n");
const notebook = (hour, notes = NOTES) => ({
  hour, notes, score: { holmes: 20, moriarty: 8, n: 24, hours: 4 },
  lines: notes.split("\n").map((text) => ({ text, wrong: text.includes("0x" + "da".repeat(32)) })),
});

// a site and an RPC in one server: /data/notebook.json, /data/seal/<hour>, and eth_call answering `root`
async function serve({ nb, sealed, root }) {
  const srv = http.createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const call = JSON.parse(body).params[0];
        assert.equal(call.to, SEALS);
        assert.equal(call.data, SEALS_SELECTOR + nb.hour.toString(16).padStart(64, "0"));
        res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: root }));
      });
      return;
    }
    if (req.url === "/data/notebook.json") return res.end(JSON.stringify(nb));
    if (req.url === `/data/seal/${nb.hour}`) return res.end(sealed);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
const sha = (b) => "0x" + createHash("sha256").update(b).digest("hex");
const rows = '{"hour": 31, "arm": "A", "ok": true}\n{"hour": 31, "arm": "B", "ok": false}\n';

test("each fact becomes one memory, with its heading as context, and wrong lines stay out", () => {
  assert.deepEqual(memoriesFrom(notebook(31)), [
    "Robinhood Chain: Pons factory: 0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e. Query eth_getLogs here for creation events.",
    "Robinhood Chain, procedures: Token→curve: eth_call token 0x7165485d.",
    "Robinhood Chain, procedures: Creator tax: eth_call curve 0xc1bb8901.",
  ]);
});

test("the seal check: bytes on the site, root on chain, notebook at the end of the bytes", async () => {
  const nb = notebook(31), sealed = rows + NOTES;
  for (const [what, opts, want] of [
    ["sealed", { nb, sealed, root: sha(sealed) }, /^$/],
    ["changed bytes", { nb, sealed: sealed + " ", root: sha(sealed) }, /do not match the seal/],
    ["not sealed yet", { nb, sealed, root: "0x" + "0".repeat(64) }, /no seal on chain/],
    ["another notebook", { nb: notebook(31, "NOTES:\n- something else.\n"), sealed, root: sha(sealed) }, /not the one that was sealed/],
  ]) {
    const s = await serve(opts);
    try {
      const r = await checkSeal(s.url, opts.nb, SEALS, s.url);
      assert.equal(r.sealed, what === "sealed", what);
      assert.match(r.sealed ? "" : r.why, want, what);
    } finally { s.close(); }
  }
  assert.deepEqual(await checkSeal("http://127.0.0.1:1", notebook(31), "", "http://127.0.0.1:1"), { sealed: false, why: "no seal contract known" });
});

test("a dry run stores nothing; --yes stores on probation; a newer notebook retires dropped lines", () => {
  const s = fresh();
  const dry = importNotebook(s, notebook(31), false);
  assert.equal(dry.add.length, 3);
  assert.equal(s.memories().size, 0);
  const done = importNotebook(s, notebook(31), true);
  assert.equal(done.stored.length, 3);
  const m = [...s.memories().values()];
  assert.ok(m.every((x) => x.status === "probation" && x.source === "casebook:hour31" && x.tags.includes("casebook-holmes")));
  assert.equal(importNotebook(s, notebook(31), true).add.length, 0);                 // the same notebook again: nothing new
  const next = NOTES.replace("- Creator tax: eth_call curve 0xc1bb8901.", "- Creator tax: eth_call curve 0xc1bb8901, returns bps.");
  const r = importNotebook(s, notebook(32, next), true);
  assert.deepEqual([r.add.length, r.drop.length], [1, 1]);
  const old = s.memories().get(r.drop[0].id);
  assert.equal(old.status, "retired");
  assert.match(old.reason, /dropped from Holmes's notebook by hour 32/);
});

test("the command: checks the seal, stores with --yes, and refuses a notebook that fails the check", async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "casebook-holmes-cli-")), ".casebook");
  const run = (args) => new Promise((ok) => execFile("node", [cli, "holmes", ...args, "--dir", dir], (err, out, errOut) => ok({ code: err ? err.code : 0, out: out + errOut })));
  const nb = notebook(31), sealed = rows + NOTES;
  let s = await serve({ nb, sealed, root: sha(sealed) });
  try {
    let r = await run(["--site", s.url, "--seals", SEALS, "--rpc", s.url]);
    assert.equal(r.code, 0);
    assert.match(r.out, /Checked: hour 31's bytes/);
    assert.match(r.out, /Would store 3/);
    r = await run(["--site", s.url, "--seals", SEALS, "--rpc", s.url, "--yes"]);
    assert.match(r.out, /Stored 3, on probation:/);
  } finally { s.close(); }
  s = await serve({ nb, sealed: sealed + "tampered", root: sha(sealed) });
  try {
    const r = await run(["--site", s.url, "--seals", SEALS, "--rpc", s.url, "--yes"]);
    assert.equal(r.code, 1);
    assert.match(r.out, /Refused: hour 31: the bytes do not match the seal/);
  } finally { s.close(); }
});
