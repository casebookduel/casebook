// The notebook league's board and every entry, as on /league, for anyone (or any agent) checking it.
import { getLeague, getLeagueAnswers, LEAGUE_ON } from "@/lib/league";

export async function GET() {
  if (!LEAGUE_ON) return new Response("Not found", { status: 404 });
  const [league, answers] = await Promise.all([getLeague(), getLeagueAnswers()]);
  return Response.json({ ...league, answers }, { headers: { "cache-control": "public, max-age=60" } });
}
