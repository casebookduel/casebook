// Guards shared by the two POST endpoints (/api/case and /api/holder).

// A browser sends Origin on every cross-site POST. No Origin means a script or curl, which the quotas still cover;
// "null" (a sandboxed frame) and any other site are refused.
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  try { return new URL(origin).host === req.headers.get("host"); } catch { return false; }
}

// The body as JSON, read with a byte cap: a huge body must not reach JSON.parse (it would exhaust the heap).
// application/json only, so a cross-site form cannot post without a CORS preflight.
export async function smallJson<T>(req: Request, max = 4096): Promise<{ body: T } | { status: 400 | 413 | 415 }> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return { status: 415 };
  if (Number(req.headers.get("content-length") ?? "0") > max) return { status: 413 };
  const reader = req.body?.getReader();
  if (!reader) return { status: 400 };
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return { status: 413 }; }
    parts.push(value);
  }
  try { return { body: JSON.parse(Buffer.concat(parts).toString("utf8")) as T }; } catch { return { status: 400 }; }
}

// The visitor's address for quotas: an IPv4 address as it is, an IPv6 address by its /64, since one home line gets
// a whole /64 and could otherwise be 2^64 visitors.
export function clientKey(req: Request): string {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "local").trim().toLowerCase();
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : ip.split(":");
  return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
