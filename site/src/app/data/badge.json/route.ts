// The README's live badge (shields.io endpoint format): the latest graded hour and both agents' share of right answers
// over every hour on the record, nothing left out.
import { getDuel } from "@/lib/duel";

export async function GET() {
  const d = await getDuel();
  const n = d.hours.reduce((s, h) => s + h.n, 0);
  const pct = (k: "holmes" | "moriarty") => (n ? Math.round((100 * d.hours.reduce((s, h) => s + h[k], 0)) / n) : 0);
  const message = d.latest ? `hour ${d.latest.hour} · Holmes ${pct("holmes")}% · Moriarty ${pct("moriarty")}%` : "no hours yet";
  return Response.json({ schemaVersion: 1, label: "record", message, color: "3bdc92" }, { headers: { "cache-control": "public, max-age=300" } });
}
