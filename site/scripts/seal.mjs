// The hourly sealer. It writes the SHA-256 of every closed hour (the bytes the site serves at /data/seal/<hour>) to
// the CasebookSeals contract on Robinhood Chain, once per hour, and appends each sealed hour to DUEL_DIR/seals.jsonl
// so the pages can link the tx. Run it every few minutes; each run seals whatever is closed and not sealed yet.
//
//   node scripts/seal.mjs key <file>   make a sealer key and write SEAL_KEY=0x... to <file> (mode 600; the key is never
//                                      printed), then print the sealer's address, to fund with a little ETH
//   node scripts/seal.mjs deploy       deploy CasebookSeals with that address as its only sealer
//   node scripts/seal.mjs              seal every closed hour that has no root yet
//   node scripts/seal.mjs status       every closed hour against the chain, and the sealer's balance (no key needed)
//
// Env: SEAL_KEY, SEAL_CONTRACT, SITE (default http://localhost:3000), RPC (default the public RPC), CHAIN_ID (4663),
//      SEALS_FILE (default DUEL_DIR/seals.jsonl), DUEL_DIR (default ../m1/out).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatEther, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const here = path.dirname(fileURLToPath(import.meta.url));
const art = JSON.parse(fs.readFileSync(path.join(here, "seals-artifact.json"), "utf8"));
const RPC = process.env.RPC || "https://rpc.mainnet.chain.robinhood.com";
const SITE = (process.env.SITE || "http://localhost:3000").replace(/\/$/, "");
const DIR = process.env.DUEL_DIR || path.resolve(here, "..", "..", "m1", "out");
const RECORDS = process.env.SEALS_FILE || path.join(DIR, "seals.jsonl");   // on the server: the sealer's own state folder
const BATCH = 40;                       // hours per tx; the first run backfills every earlier hour
const LOW_GAS = 10n ** 14n;             // 0.0001 ETH: warn below this (a seal costs far less)
const ZERO = "0x" + "0".repeat(64);
const chain = defineChain({ id: Number(process.env.CHAIN_ID || 4663), name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 4 }) });

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const say = (msg) => console.log(`${stamp()} ${msg}`);
const die = (msg) => { console.error(`${stamp()} ${msg}`); process.exit(1); };
const need = (name, re) => { const v = (process.env[name] || "").trim(); if (!re.test(v)) die(`${name} is not set`); return v; };
const sha = (b) => "0x" + crypto.createHash("sha256").update(b).digest("hex");
const read = (contract, functionName, args = []) => pub.readContract({ address: contract, abi: art.abi, functionName, args });

async function get(url, kind) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) die(`${url}: HTTP ${r.status}`);
  return kind === "json" ? r.json() : Buffer.from(await r.arrayBuffer());
}

function records() {
  if (!fs.existsSync(RECORDS)) return new Map();
  const text = fs.readFileSync(RECORDS, "utf8");
  return new Map(text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return [r.hour, r]; }));
}

function keep(rows) {   // one append per tx; the site reads whole lines only
  fs.appendFileSync(RECORDS, rows.map((r) => JSON.stringify(r) + "\n").join(""));
}

async function makeKey(file) {
  if (!file) die("usage: node scripts/seal.mjs key <file>");
  const key = generatePrivateKey();
  fs.writeFileSync(file, `SEAL_KEY=${key}\n`, { mode: 0o600, flag: "wx" });   // refuses to overwrite an existing file
  console.log(privateKeyToAccount(key).address);
}

async function deploy() {
  const account = privateKeyToAccount(need("SEAL_KEY", /^0x[0-9a-fA-F]{64}$/));
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [account.address] });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success" || !rc.contractAddress) die(`deploy failed: tx ${hash}`);
  say(`deployed at block ${rc.blockNumber}, tx ${hash}`);
  console.log(`SEAL_CONTRACT=${rc.contractAddress}`);
}

async function sealMissing() {
  const account = privateKeyToAccount(need("SEAL_KEY", /^0x[0-9a-fA-F]{64}$/));
  const contract = need("SEAL_CONTRACT", /^0x[0-9a-fA-F]{40}$/);
  if ((await read(contract, "sealer")).toLowerCase() !== account.address.toLowerCase()) die("SEAL_KEY is not the contract's sealer");
  const index = await get(`${SITE}/data/seal`, "json");
  const sent = records(), todo = [], changed = [];
  for (const h of index.hours) {
    if (sent.has(h.hour)) {
      // a sealed hour whose bytes changed: the pages' check will show it; say it loudly and keep sealing the others
      if (sent.get(h.hour).root !== h.root) changed.push(`hour ${h.hour} changed after it was sealed: sealed ${sent.get(h.hour).root}, now ${h.root}`);
      continue;
    }
    const root = sha(await get(`${SITE}/data/seal/${h.hour}`));   // hash the bytes ourselves, not the index's word
    if (root !== h.root) die(`hour ${h.hour}: the served bytes hash to ${root}, the index says ${h.root}`);
    const onChain = (await read(contract, "seals", [BigInt(h.hour)])).toLowerCase();
    if (onChain === ZERO) { todo.push({ hour: h.hour, root }); continue; }
    if (onChain !== root) { changed.push(`hour ${h.hour}: on chain ${onChain}, served ${root}`); continue; }
    // sealed by an earlier run that stopped before writing its record: recover the tx from the Sealed event
    const [ev] = await pub.getContractEvents({ address: contract, abi: art.abi, eventName: "Sealed", args: { hour: BigInt(h.hour) },
      fromBlock: (await pub.getBlockNumber()) - 9_000_000n });
    keep([{ hour: h.hour, root, tx: ev?.transactionHash ?? null, block: ev ? Number(ev.blockNumber) : null, ts: Math.floor(Date.now() / 1000) }]);
  }
  for (const c of changed) console.error(`${stamp()} MISMATCH ${c}`);
  if (!todo.length) {
    say(`nothing to seal (${index.hours.length} closed hours)`);
    if (changed.length) process.exit(1);
    return;
  }
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    const hash = await wallet.writeContract({ address: contract, abi: art.abi, functionName: "seal",
      args: [part.map((p) => BigInt(p.hour)), part.map((p) => p.root)] });
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") die(`seal tx reverted: ${hash}`);
    const ts = Number((await pub.getBlock({ blockNumber: rc.blockNumber })).timestamp);
    keep(part.map((p) => ({ ...p, tx: hash, block: Number(rc.blockNumber), ts })));
    say(`sealed hour${part.length > 1 ? `s ${part[0].hour}-${part.at(-1).hour}` : ` ${part[0].hour}`} in tx ${hash} (block ${rc.blockNumber})`);
  }
  const left = await pub.getBalance({ address: account.address });
  if (left < LOW_GAS) say(`warning: the sealer has ${formatEther(left)} ETH left; send a little more to ${account.address}`);
  if (changed.length) process.exit(1);
}

async function status() {
  const contract = need("SEAL_CONTRACT", /^0x[0-9a-fA-F]{40}$/);
  const sealer = await read(contract, "sealer");
  const index = await get(`${SITE}/data/seal`, "json");
  let ok = 0, waiting = 0, bad = 0;
  for (const h of index.hours) {
    const onChain = (await read(contract, "seals", [BigInt(h.hour)])).toLowerCase();
    if (onChain === ZERO) waiting++;
    else if (onChain === h.root) ok++;
    else { bad++; console.log(`hour ${h.hour}: MISMATCH, on chain ${onChain}, served ${h.root}`); }
  }
  console.log(`contract ${contract}, sealer ${sealer} with ${formatEther(await pub.getBalance({ address: sealer }))} ETH`);
  console.log(`${index.hours.length} closed hours: ${ok} sealed and matching, ${waiting} waiting, ${bad} mismatched`);
  if (bad) process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
const run = { key: () => makeKey(arg), deploy, status, undefined: sealMissing }[cmd];
if (!run) die("usage: node scripts/seal.mjs [key <file> | deploy | status]");
await run().catch((e) => die(String(e?.shortMessage || e?.message || e).split("\n")[0]));
