// The exact bytes an hour's seal covers: /data/seal/13. Check it with
//   curl -s <site>/data/seal/13 | shasum -a 256
// and compare the hash with seals(13) on the contract.
import { connection } from "next/server";
import { sealBytes } from "@/lib/seal";

export async function GET(_req: Request, ctx: RouteContext<"/data/seal/[hour]">) {
  await connection();
  const { hour } = await ctx.params;
  const bytes = /^\d{1,6}$/.test(hour) ? sealBytes(Number(hour)) : null;
  if (!bytes) return new Response("not a closed hour\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
