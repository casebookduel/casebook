// The holder perk's check. GET ?address= gives the exact text to sign; POST {address, signature} checks the signature
// and the $CASE balance on chain and, if it is enough, sets a cookie that lasts until 00:00 UTC.
import { checkHolder, HOLDER_CASES, HOLDER_MIN, HOLDER_ON, holderCookie, holderMessage } from "@/lib/holder";
import { clientKey, sameOrigin, smallJson } from "@/lib/request";

// Known limit: in-memory limits for one server process; each check costs a few public RPC reads the runner also needs
const hits = new Map<string, number[]>();
const HOUR = 3_600_000;
function limited(key: string, max: number) {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= HOUR) hits.delete(k);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= max) { hits.set(key, recent); return true; }
  recent.push(now);
  hits.set(key, recent);
  return false;
}
const json = (o: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(o, { status, headers: { "cache-control": "no-store", ...headers } });
const ADDR = /^0x[0-9a-fA-F]{40}$/;

export async function GET(req: Request) {
  if (!HOLDER_ON) return json({ error: "off" }, 404);
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!ADDR.test(address)) return json({ error: "input" }, 400);
  return json({ message: holderMessage(address), min: HOLDER_MIN, cases: HOLDER_CASES });
}

export async function POST(req: Request) {
  if (!HOLDER_ON) return json({ error: "off" }, 404);
  if (!sameOrigin(req)) return json({ error: "origin" }, 403);
  const got = await smallJson<{ address?: unknown; signature?: unknown }>(req, 8192);
  if (!("body" in got)) return json({ error: "input" }, got.status);
  const address = String(got.body?.address ?? ""), signature = String(got.body?.signature ?? "");
  if (!ADDR.test(address) || !/^0x[0-9a-fA-F]{130,4000}$/.test(signature)) return json({ error: "input" }, 400);
  // per visitor first, so one address cannot use up the shared allowance; the shared one counts only real checks
  if (limited(clientKey(req), 6) || limited("all", 120)) return json({ error: "slow" }, 429);
  try {
    const r = await checkHolder(address as `0x${string}`, signature as `0x${string}`);
    if (!r.ok) return json({ ok: false, why: r.why, balance: "balance" in r ? r.balance : undefined, min: HOLDER_MIN });
    return json({ ok: true, balance: r.balance, cases: HOLDER_CASES }, 200, { "set-cookie": holderCookie(address) });
  } catch {
    return json({ error: "chain" }, 502);
  }
}
