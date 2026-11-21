// The learning trail as data: the same numbers and lines as /trail, for anyone (or any agent) checking them.
import { getDuel } from "@/lib/duel";
import { OPEN } from "@/lib/open";
import { buildTrail } from "@/lib/trail";

export async function GET() {
  if (!OPEN.has("trail")) return new Response("Not found", { status: 404 });
  const d = await getDuel();
  return Response.json(buildTrail(d.hours, d.notes), { headers: { "cache-control": "public, max-age=60" } });
}
