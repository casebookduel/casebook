// The notebook league's board and every entry, as on /league, for anyone (or any agent) checking it.
import { getLeague, LEAGUE_ON } from "@/lib/league";

export async function GET() {
  if (!LEAGUE_ON) return new Response("Not found", { status: 404 });
  return Response.json(await getLeague(), { headers: { "cache-control": "public, max-age=60" } });
}
