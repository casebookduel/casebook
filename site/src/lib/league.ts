// The notebook league as the site reads it: CasebookLeague on chain (its fee and every Entered event) merged with the
// runner's state (m1/league.py writes DUEL_DIR/league.json). A notebook the runner has not read yet shows as queued, or
// as not played when it breaks the published rules. Off until OPEN_FEATURES names "league" and both the league contract
// and the token are set.
import fs from "node:fs";
import path from "node:path";
import { cacheLife } from "next/cache";
import { decodeEventLog, erc20Abi, formatUnits, toEventSelector, toFunctionSelector, type Abi } from "viem";
import artifact from "../../scripts/league-artifact.json";
import { boardOrder } from "./board.ts";
import { client } from "./chain";
import { DIR } from "./duel";
import { refused } from "./lessonRules.ts";
import { OPEN } from "./open";
import { TOKEN_CA } from "./site";

const ABI = artifact.abi as Abi;
const raw = (process.env.LEAGUE_CONTRACT ?? "").trim();
export const LEAGUE_CONTRACT = /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : "";
const FROM = BigInt(Number(process.env.LEAGUE_FROM || 0) || 0);
export const LEAGUE_ON = OPEN.has("league") && !!LEAGUE_CONTRACT && !!TOKEN_CA;
export const LEAGUE_MAX = 2000, LEAGUE_HOURS = 24;   // the contract's limit; m1/league.py HOURS
const SPAN = BigInt(9_000_000);

export const LEAGUE_CALLS = {
  approve: toFunctionSelector("approve(address,uint256)"), allowance: toFunctionSelector("allowance(address,address)"),
  balanceOf: toFunctionSelector("balanceOf(address)"), fn: toFunctionSelector("enter(string)"),
  event: toEventSelector("Entered(uint256,address,uint256,string)"),
};

export type EntryStatus = "queued" | "playing" | "done" | "filtered";
export type Entry = { id: number; player: string; text: string; tx: string; block: number; status: EntryStatus; why: string | null;
  hours: number[]; right: number; holmes: number; moriarty: number; n: number };

function runner(): { entries: Entry[] } {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "league.json"), "utf8")); } catch { return { entries: [] }; }
}

async function onChain(): Promise<Entry[]> {
  const head = await client.getBlockNumber(), out: Entry[] = [];
  for (let a = FROM; a <= head; a += SPAN) {
    const b = a + SPAN - BigInt(1) < head ? a + SPAN - BigInt(1) : head;
    for (const l of await client.getLogs({ address: LEAGUE_CONTRACT as `0x${string}`, fromBlock: a, toBlock: b })) {
      const e = decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }) as unknown as { eventName: string; args: { id: bigint; player: string; notebook: string } };
      if (e.eventName !== "Entered") continue;
      const why = refused(e.args.notebook, { max: LEAGUE_MAX, lines: true });
      out.push({ id: Number(e.args.id), player: e.args.player.toLowerCase(), text: e.args.notebook, tx: l.transactionHash ?? "", block: Number(l.blockNumber),
        status: why ? "filtered" : "queued", why, hours: [], right: 0, holmes: 0, moriarty: 0, n: 0 });
    }
  }
  return out;
}

export async function getLeague() {
  "use cache";
  cacheLife("minutes");   // shorter lives count as runtime data and would stop the page prerendering; the form shows the new id at once
  const st = runner();
  const read = (functionName: string, address = LEAGUE_CONTRACT, abi: Abi = ABI) => client.readContract({ address: address as `0x${string}`, abi, functionName }) as Promise<bigint | number | string>;
  let chainEntries: Entry[] | null = null, fee = BigInt(0), decimals = 18, symbol = "CASE";
  try {
    const [f, d, s, es] = await Promise.all([read("fee"), read("decimals", TOKEN_CA, erc20Abi as Abi), read("symbol", TOKEN_CA, erc20Abi as Abi), onChain()]);
    [fee, decimals, symbol, chainEntries] = [f as bigint, Number(d), String(s), es];
  } catch { /* shown below as not live */ }
  const known = new Map(st.entries.map((e) => [e.id, e]));
  const entries = boardOrder((chainEntries ?? st.entries).map((e) => known.get(e.id) ?? e));
  return { live: chainEntries !== null, contract: LEAGUE_CONTRACT, token: TOKEN_CA, fee: fee.toString(), feeText: formatUnits(fee, decimals), symbol, entries };
}
