// Teach Holmes as the site reads it: the lessons contract on chain (its fee and every Taught event) merged with the
// runner's state (m1/lessons.py writes DUEL_DIR/lessons.json). A lesson the runner has not read yet shows as queued,
// or as not tested when it breaks the published rules; the runner reads new lessons at the start of each hour.
// Off until OPEN_FEATURES names "teach" and both the lessons contract and the token are set.
import fs from "node:fs";
import path from "node:path";
import { cacheLife } from "next/cache";
import { decodeEventLog, erc20Abi, formatUnits, toEventSelector, toFunctionSelector, type Abi } from "viem";
import artifact from "../../scripts/lessons-artifact.json";
import { DIR } from "./duel";
import { refused } from "./lessonRules.ts";
import { OPEN } from "./open";
import { client } from "./chain";
import { TOKEN_CA } from "./site";

const ABI = artifact.abi as Abi;
const raw = (process.env.LESSONS_CONTRACT ?? "").trim();
export const LESSONS_CONTRACT = /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : "";
const FROM = BigInt(Number(process.env.LESSONS_FROM || 0) || 0);
export const TEACH_ON = OPEN.has("teach") && !!LESSONS_CONTRACT && !!TOKEN_CA;
const SPAN = 9_000_000n;
const DEAD = "0x000000000000000000000000000000000000dEaD";

// what a browser wallet sends and reads, computed here so nothing is typed by hand
export const CALLS = {
  approve: toFunctionSelector("approve(address,uint256)"), allowance: toFunctionSelector("allowance(address,address)"),
  balanceOf: toFunctionSelector("balanceOf(address)"), teach: toFunctionSelector("teach(string)"),
  taught: toEventSelector("Taught(uint256,address,uint256,string)"),
};

export type LessonStatus = "queued" | "testing" | "kept" | "rejected" | "filtered" | "retired";
export type Lesson = { id: number; teacher: string; text: string; tx: string; block: number; status: LessonStatus; why: string | null;
  hours: number[]; with_ok: number; without_ok: number; n: number };

function runner(): { lessons: Lesson[]; taught: number[] } {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "lessons.json"), "utf8")); } catch { return { lessons: [], taught: [] }; }
}

async function onChain(): Promise<Lesson[]> {
  const head = await client.getBlockNumber(), out: Lesson[] = [];
  for (let a = FROM; a <= head; a += SPAN) {
    const b = a + SPAN - 1n < head ? a + SPAN - 1n : head;
    for (const l of await client.getLogs({ address: LESSONS_CONTRACT as `0x${string}`, fromBlock: a, toBlock: b })) {
      const e = decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }) as unknown as { eventName: string; args: { id: bigint; teacher: string; lesson: string } };
      if (e.eventName !== "Taught") continue;
      const why = refused(e.args.lesson);
      out.push({ id: Number(e.args.id), teacher: e.args.teacher.toLowerCase(), text: e.args.lesson, tx: l.transactionHash ?? "", block: Number(l.blockNumber),
        status: why ? "filtered" : "queued", why, hours: [], with_ok: 0, without_ok: 0, n: 0 });
    }
  }
  return out;
}

// Every lesson, newest first, with the runner's word where it has one. If the chain cannot be read, the runner's
// state alone (`live: false`), so the page still shows what was tested.
export async function getLessons() {
  "use cache";
  cacheLife("minutes");   // shorter lives count as runtime data and would stop the page prerendering; the form shows the new id at once
  const st = runner();
  const read = (functionName: string, address = LESSONS_CONTRACT, abi: Abi = ABI) => client.readContract({ address: address as `0x${string}`, abi, functionName }) as Promise<bigint | number | string>;
  let chainLessons: Lesson[] | null = null, fee = 0n, decimals = 18, symbol = "CASE", burned = 0n, supply = 0n;
  try {
    const token = { address: TOKEN_CA as `0x${string}`, abi: erc20Abi } as const;
    const [f, d, s, ls, bd, sp] = await Promise.all([read("fee"), read("decimals", TOKEN_CA, erc20Abi as Abi), read("symbol", TOKEN_CA, erc20Abi as Abi), onChain(),
      client.readContract({ ...token, functionName: "balanceOf", args: [DEAD] }), client.readContract({ ...token, functionName: "totalSupply" })]);
    [fee, decimals, symbol, chainLessons, burned, supply] = [f as bigint, Number(d), String(s), ls, bd, sp];
  } catch { /* shown below as not live */ }
  const known = new Map(st.lessons.map((l) => [l.id, l]));
  const lessons = (chainLessons ?? st.lessons).map((l) => known.get(l.id) ?? l).sort((a, b) => b.id - a.id);
  // everything ever sent to 0x…dEaD, by anyone (lesson fees and other burns alike), and the supply it is a share of
  return { live: chainLessons !== null, contract: LESSONS_CONTRACT, token: TOKEN_CA, fee: fee.toString(), feeText: formatUnits(fee, decimals), symbol, lessons, taught: st.taught,
    burned: Number(formatUnits(burned, decimals)), supply: Number(formatUnits(supply, decimals)) };
}
