// The numbers on these pages, without the step traces, for anyone (or any agent) checking them.
import { getDuel } from "@/lib/duel";

export async function GET() {
  const d = await getDuel();
  const hours = d.hours.map(({ tasks, ...h }) => ({
    ...h, notesUsed: undefined,
    tasks: tasks.map((t) => ({ kind: t.kind, q: t.q, key: t.truth, holmes: { answer: t.holmes.answer, ok: t.holmes.ok, calls: t.holmes.calls }, moriarty: { answer: t.moriarty.answer, ok: t.moriarty.ok, calls: t.moriarty.calls } })),
  }));
  return Response.json({ updated: d.updated, ruleV2From: d.ruleV2From, since: d.since, pairs: d.pairs, levels: d.levels, missed: d.missed, hours, notes: d.notes }, { headers: { "cache-control": "public, max-age=60" } });
}
