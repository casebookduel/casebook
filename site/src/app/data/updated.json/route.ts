// What an open page checks once a minute: when the record last changed, in a few bytes instead of the whole summary.
import { getDuel } from "@/lib/duel";

export async function GET() {
  const d = await getDuel();
  return Response.json({ updated: d.updated }, { headers: { "cache-control": "public, max-age=30" } });
}
