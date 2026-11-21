// Holmes's notebook as `npx casebook-memory holmes` imports it: the notebook he wrote after the latest sealed hour (the
// latest hour while nothing is sealed), exactly as the file holds it, so the command can find it at the end of that
// hour's sealed bytes; line by line with the lines that are wrong on chain marked; and his score over the last 24 hours.
// Closed until OPEN_FEATURES names "skill".
import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { DIR, getDuel } from "@/lib/duel";
import { checkLine } from "@/lib/facts";
import { OPEN } from "@/lib/open";
import { getSeals, SEAL_CONTRACT } from "@/lib/seal";

export async function GET() {
  await connection();
  if (!OPEN.has("skill")) return new Response("Not found", { status: 404 });
  const d = await getDuel();
  const file = (h: number) => path.join(DIR, `notes_h${String(h).padStart(2, "0")}.md`);
  const sealed = SEAL_CONTRACT ? new Set(Object.keys(await getSeals()).map(Number)) : null;
  const hour = d.notes.map((n) => n.hour).filter((h) => (!sealed || sealed.has(h)) && fs.existsSync(/* turbopackIgnore: true */ file(h))).at(-1);
  if (hour === undefined) return Response.json({ error: "no notebook yet" }, { status: 503 });
  const notes = fs.readFileSync(/* turbopackIgnore: true */ file(hour), "utf8");
  const last = d.hours.slice(-24), sum = (k: "holmes" | "moriarty" | "n") => last.reduce((s, h) => s + h[k], 0);
  return Response.json({
    hour, notes, lines: notes.split("\n").map((text) => ({ text, wrong: !!checkLine(text) })),
    score: { holmes: sum("holmes"), moriarty: sum("moriarty"), n: sum("n"), hours: last.length }, seals: SEAL_CONTRACT || null,
  }, { headers: { "cache-control": "public, max-age=60" } });
}
