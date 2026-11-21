// The two burn contracts for $CASE, CasebookLessons (Teach Holmes) and CasebookLeague (the notebook league): deploy
// each once the token exists, then check it.
//
//   node scripts/lessons.mjs deploy <token> <fee>          CasebookLessons with the sealer's key (SEAL_KEY); <fee> in whole
//                                                          tokens; prints LESSONS_CONTRACT and LESSONS_FROM for the env files
//   node scripts/lessons.mjs deploy-league <token> <fee>   CasebookLeague the same way; prints LEAGUE_CONTRACT and LEAGUE_FROM
//   node scripts/lessons.mjs status | status-league        the token, the fee and the count so far (no key needed)
//
// Env: SEAL_KEY (deploy), LESSONS_CONTRACT or LEAGUE_CONTRACT (status), RPC (default the public RPC), CHAIN_ID (4663).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, erc20Abi, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = path.dirname(fileURLToPath(import.meta.url));
const KINDS = {
  lessons: { art: "lessons-artifact.json", env: "LESSONS", count: "lessons", per: "a lesson" },
  league: { art: "league-artifact.json", env: "LEAGUE", count: "entries", per: "an entry" },
};
const [cmd, ...args] = process.argv.slice(2);
const K = KINDS[cmd?.endsWith("league") ? "league" : "lessons"];
const art = JSON.parse(fs.readFileSync(path.join(here, K.art), "utf8"));
const RPC = process.env.RPC || "https://rpc.mainnet.chain.robinhood.com";
const chain = defineChain({ id: Number(process.env.CHAIN_ID || 4663), name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 4 }) });
const die = (msg) => { console.error(msg); process.exit(1); };
const addr = (v, what) => { if (!/^0x[0-9a-fA-F]{40}$/.test(v || "")) die(`${what} is not an address`); return v; };
const token = (address) => ({
  decimals: () => pub.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
  symbol: () => pub.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
});

async function deploy(tokenCa, whole) {
  addr(tokenCa, "the token");
  if (!/^[1-9]\d*$/.test(whole || "")) die("the fee is a whole number of tokens, e.g. 100000");
  const key = (process.env.SEAL_KEY || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) die("SEAL_KEY is not set");
  const t = token(tokenCa), [decimals, symbol] = await Promise.all([t.decimals(), t.symbol()]);
  const account = privateKeyToAccount(key), wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [tokenCa, parseUnits(whole, decimals)] });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success" || !rc.contractAddress) die(`deploy failed: tx ${hash}`);
  console.error(`deployed for ${symbol}, ${whole} tokens ${K.per}, at block ${rc.blockNumber}, tx ${hash}`);
  console.log(`${K.env}_CONTRACT=${rc.contractAddress}`);
  console.log(`${K.env}_FROM=${rc.blockNumber}`);
}

async function status() {
  const address = addr(process.env[`${K.env}_CONTRACT`], `${K.env}_CONTRACT`);
  const read = (functionName) => pub.readContract({ address, abi: art.abi, functionName });
  const [tok, fee, done] = await Promise.all([read("token"), read("fee"), read(K.count)]);
  const t = token(tok), [decimals, symbol] = await Promise.all([t.decimals(), t.symbol()]);
  console.log(`token ${tok} (${symbol}), ${formatUnits(fee, decimals)} ${K.per}, ${done} so far, ${formatUnits(fee * done, decimals)} burned`);
}

if (cmd === "deploy" || cmd === "deploy-league") await deploy(...args);
else if (cmd === "status" || cmd === "status-league") await status();
else die("usage: node scripts/lessons.mjs deploy | deploy-league <token> <fee>, or status | status-league");
