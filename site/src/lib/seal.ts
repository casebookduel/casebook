// Hourly seals. What a seal covers, byte for byte: the hour's rows of results.jsonl exactly as the runner wrote them,
// in file order, then the notebook Holmes wrote after that hour (notes_hNN.md), if he wrote one. /data/seal/<hour>
// serves those bytes, and their SHA-256 is the root the sealer writes once to the CasebookSeals contract. Anyone can
// download the bytes, hash them and compare the hash with the contract, without trusting this site.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cacheLife } from "next/cache";
import { encodeFunctionData, type Abi } from "viem";
import artifact from "../../scripts/seals-artifact.json";
import { DIR } from "./duel";

// SEAL_RPC only for local tests; it is shown to browsers, so it must never be a URL with a key in it
export const RPC_URL = process.env.SEAL_RPC || "https://rpc.mainnet.chain.robinhood.com";
export const SEALS_ABI = artifact.abi as Abi;

// The contract, set once it is deployed. Until then no page mentions seals.
const addr = (process.env.SEAL_CONTRACT ?? "").trim();
export const SEAL_CONTRACT = /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr.toLowerCase() : "";

// eth_call data for seals(hour), so a browser can read the root straight from the chain
export const sealsCall = (hour: number) => encodeFunctionData({ abi: SEALS_ABI, functionName: "seals", args: [BigInt(hour)] });

const sha = (b: Buffer) => "0x" + crypto.createHash("sha256").update(b).digest("hex");
const ROW = /^\{"hour": (\d+),/;   // the runner writes every row as json.dumps(dict(hour=..., ...)), so the hour comes first

type Slices = { at: string; byHour: Map<number, Buffer[]>; last: number };
let memo: Slices | null = null;

// Known limit: rereads the whole file when it changes (once an hour); an offset index if results.jsonl ever reaches GBs
function slices(): Slices {
  const file = path.join(DIR, "results.jsonl");
  const st = fs.existsSync(file) ? fs.statSync(file) : null;
  const at = st ? `${st.size}:${st.mtimeMs}` : "none";
  if (memo?.at === at) return memo;
  const byHour = new Map<number, Buffer[]>();
  let last = -1;
  if (st) {
    const raw = fs.readFileSync(file);
    const end = raw.lastIndexOf(0x0a) + 1;           // the runner may be mid-write: whole lines only
    for (let i = 0; i < end;) {
      const j = raw.indexOf(0x0a, i) + 1;
      const line = raw.subarray(i, j);
      const m = ROW.exec(line.subarray(0, 24).toString("latin1"));
      if (m) {
        const h = Number(m[1]);
        byHour.set(h, [...(byHour.get(h) ?? []), line]);
        last = Math.max(last, h);
      }
      i = j;
    }
  }
  memo = { at, byHour, last };
  return memo;
}

const notesFile = (h: number) => path.join(DIR, `notes_h${String(h).padStart(2, "0")}.md`);

// An hour is closed, and can be sealed, once Holmes has written his notes after it, or a later hour has rows (an hour
// whose reflection failed has no notes, and its seal covers its rows alone).
function closed(h: number, s: Slices) {
  return s.byHour.has(h) && (fs.existsSync(notesFile(h)) || s.last > h);
}

export function sealBytes(hour: number): Buffer | null {
  const s = slices();
  if (!closed(hour, s)) return null;
  const notes = fs.existsSync(notesFile(hour)) ? fs.readFileSync(notesFile(hour)) : Buffer.alloc(0);
  return Buffer.concat([...s.byHour.get(hour)!, notes]);
}

export type SealRecord = { hour: number; root: string; tx: string; block: number; ts: number };

// What the sealer has sent, from DUEL_DIR/seals.jsonl (it appends one line per sealed hour once its tx is mined)
// The sealer runs as its own user and keeps its records in its own folder (SEALS_FILE on the server).
const RECORDS = process.env.SEALS_FILE ? path.resolve(/* turbopackIgnore: true */ process.env.SEALS_FILE) : path.join(DIR, "seals.jsonl");

export function sealRecords(): Map<number, SealRecord> {
  const file = RECORDS;
  if (!fs.existsSync(/* turbopackIgnore: true */ file)) return new Map();
  const text = fs.readFileSync(/* turbopackIgnore: true */ file, "utf8");
  const rows = text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map((l) => JSON.parse(l) as SealRecord);
  return new Map(rows.map((r) => [r.hour, r]));
}

// Every closed hour with its root, and the seal tx once there is one. Hashing every hour is a few MB of work, so the
// result is kept for 30 seconds (the sealer polls every 5 minutes); a closed hour's root never changes anyway.
let index: { at: number; rows: ReturnType<typeof build> } | null = null;
function build() {
  const s = slices(), sent = sealRecords();
  return [...s.byHour.keys()].sort((a, b) => a - b).filter((h) => closed(h, s)).map((h) => {
    const root = sha(sealBytes(h)!), r = sent.get(h);
    return { hour: h, root, ...(r ? { tx: r.tx, block: r.block, sealedAt: r.ts, onChainRoot: r.root } : {}) };
  });
}
export function sealIndex() {
  if (!index || Date.now() - index.at > 30_000) index = { at: Date.now(), rows: build() };
  return index.rows;
}

// The pages read the seal records through this, refreshed with the duel data (a running server picks up new seals
// without a rebuild).
export async function getSeals(): Promise<Record<number, SealRecord>> {
  "use cache";
  cacheLife("minutes");
  return Object.fromEntries(sealRecords());
}
