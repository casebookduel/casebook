// The holder perk: a wallet holding at least HOLDER_MIN $CASE gets HOLDER_CASES visitor cases a day instead of the
// free FREE_PER_DAY. The proof is a signed message (personal_sign: no transaction, no approval, nothing sent), checked
// here against the chain, then remembered in a cookie that lasts until 00:00 UTC.
import crypto from "node:crypto";
import { createPublicClient, defineChain, erc20Abi, formatUnits, http, parseUnits } from "viem";
import { RPC_URL } from "./seal";
import { SITE_URL, TOKEN_CA } from "./site";

export const HOLDER_MIN = Number(process.env.HOLDER_MIN || 0);      // whole tokens; 0 keeps the perk off
export const HOLDER_CASES = Number(process.env.HOLDER_CASES || 20);
export const HOLDER_ON = !!TOKEN_CA && HOLDER_MIN > 0;
const SECRET = process.env.HOLDER_SECRET || crypto.randomBytes(32).toString("hex");   // a restart only asks holders to sign again
const COOKIE = "cb_holder";

const chain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const client = createPublicClient({ chain, transport: http(RPC_URL) });

export const today = () => new Date().toISOString().slice(0, 10);
export const holderMessage = (address: string, day = today()) =>
  `Casebook holder check\nAddress: ${address.toLowerCase()}\nDay: ${day} (UTC)\nSigning proves this wallet holds $CASE. It sends nothing and costs nothing.`;

let decimals: number | null = null;
async function balance(address: `0x${string}`) {
  const token = TOKEN_CA as `0x${string}`;
  decimals ??= await client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
  const bal = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  return { enough: bal >= parseUnits(String(HOLDER_MIN), decimals), text: formatUnits(bal, decimals) };
}

export async function checkHolder(address: `0x${string}`, signature: `0x${string}`) {
  // verifyMessage also accepts smart-contract wallets (ERC-1271), which sign through the chain
  if (!(await client.verifyMessage({ address, message: holderMessage(address), signature }))) return { ok: false as const, why: "signature" as const };
  const b = await balance(address);
  return { ok: b.enough, balance: b.text, why: "balance" as const };
}

// The balance again when a holder starts a case, so tokens passed from wallet to wallet do not keep every cookie
// valid. Cached for a minute per wallet; a failed read counts as not holding.
const recent = new Map<string, { at: number; ok: boolean }>();
export async function stillHolds(address: string): Promise<boolean> {
  const hit = recent.get(address);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  if (recent.size > 5_000) recent.clear();
  const ok = await balance(address as `0x${string}`).then((b) => b.enough, () => false);
  recent.set(address, { at: Date.now(), ok });
  return ok;
}

const mac = (v: string) => crypto.createHmac("sha256", SECRET).update(v).digest("hex");

export function holderCookie(address: string) {
  const v = `${address.toLowerCase()}.${today()}`;
  const midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0);
  const age = Math.max(60, Math.floor((midnight.getTime() - Date.now()) / 1000));
  return `${COOKIE}=${v}.${mac(v)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${SITE_URL.startsWith("https://") ? "; Secure" : ""}`;
}

// the holder's address from a valid cookie of today, else null
export const holderFrom = (req: Request) => holderFromHeader(req.headers.get("cookie") ?? "");
export function holderFromHeader(cookie: string): string | null {
  if (!HOLDER_ON) return null;
  const raw = cookie.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  const [addr, day, sig] = (raw ?? "").split(".");
  if (!addr || !sig || day !== today() || !/^0x[0-9a-f]{40}$/.test(addr)) return null;
  const want = Buffer.from(mac(`${addr}.${day}`)), got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? addr : null;
}
