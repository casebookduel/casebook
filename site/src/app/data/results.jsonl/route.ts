// The raw file every page is built from: one row per question per agent, with every step.
import { rawResults } from "@/lib/duel";

export async function GET() {
  return new Response(await rawResults(), { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "public, max-age=60" } });
}
