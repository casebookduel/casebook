// One hour in full, step traces included: /data/hours/13
import { getDuel } from "@/lib/duel";

export async function GET(_req: Request, ctx: RouteContext<"/data/hours/[hour]">) {
  const { hour } = await ctx.params;
  const h = (await getDuel()).hours.find((x) => String(x.hour) === hour);
  if (!h) return Response.json({ error: "no such hour" }, { status: 404 });
  return Response.json(h, { headers: { "cache-control": "public, max-age=60" } });
}
