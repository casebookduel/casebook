// The learning trail. For each kind of question: Holmes's results hour by hour beside Moriarty's, what Holmes changed in
// his notes after each miss, and which notebook changes he had read before he missed a kind he got right the time
// before. Only the record and the notes are used, nothing is judged by a model, and a change is shown next to a
// result, never as its cause.
import { diffLines } from "./diff.ts";
import { checkLine } from "./facts.ts";

export type TrailTask = { kind: string; truth: string; retention: boolean; holmes: { ok: boolean; answer: string | null }; moriarty: { ok: boolean } };
export type TrailHour = { hour: number; tasks: TrailTask[] };
export type TrailNote = { hour: number; text: string };

export type Change = { add: string[]; del: string[] };
export type Cell = { hour: number; h: boolean; m: boolean; retention: boolean };
export type KindTrail = { kind: string; cells: Cell[]; holmes: number; moriarty: number; n: number; streak: number };
export type Miss = { kind: string; answer: string | null; truth: string; next: { hour: number; ok: boolean } | null };
export type MissHour = { hour: number; misses: Miss[]; wrote: Change | null };
export type Setback = { hour: number; kind: string; rightAt: number; read: Change };
export type WrongLine = { line: string; topic: string; from: number; to: number };
export type Trail = { kinds: KindTrail[]; mistakes: MissHour[]; setbacks: Setback[]; wrong: WrongLine[]; totals: { misses: number; fixedNext: number; setbacks: number; wrong: number } };

const change = (prev: string, next: string): Change => {
  const rows = diffLines(prev, next);
  return { add: rows.filter((r) => r.k === "add").map((r) => r.l), del: rows.filter((r) => r.k === "del").map((r) => r.l) };
};

export function buildTrail(hours: TrailHour[], notes: TrailNote[]): Trail {
  const written = new Map(notes.map((n) => [n.hour, n.text]));
  // the notebook as it stood after hour h: the latest version written at or before h ("" before the first)
  const asOf = (h: number) => { for (let x = h; x >= 0; x--) if (written.has(x)) return written.get(x)!; return ""; };

  // every question of each kind, in hour order
  const byKind = new Map<string, { hour: number; t: TrailTask }[]>();
  for (const hr of hours) for (const t of hr.tasks) byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), { hour: hr.hour, t }]);

  const kinds: KindTrail[] = [...byKind.entries()].map(([kind, qs]) => {
    let streak = 0;
    for (let i = qs.length - 1; i >= 0 && qs[i].t.holmes.ok; i--) streak++;
    return {
      kind, cells: qs.map(({ hour, t }) => ({ hour, h: t.holmes.ok, m: t.moriarty.ok, retention: t.retention })),
      holmes: qs.filter((q) => q.t.holmes.ok).length, moriarty: qs.filter((q) => q.t.moriarty.ok).length, n: qs.length, streak,
    };
  });

  // a miss, what he wrote right after it, and how the next question of the same kind went
  const nextOf = (kind: string, hour: number) => (byKind.get(kind) ?? []).find((q) => q.hour > hour) ?? null;
  const mistakes: MissHour[] = hours.flatMap((hr) => {
    const misses = hr.tasks.filter((t) => !t.holmes.ok).map((t): Miss => {
      const n = nextOf(t.kind, hr.hour);
      return { kind: t.kind, answer: t.holmes.answer, truth: t.truth, next: n ? { hour: n.hour, ok: n.t.holmes.ok } : null };
    });
    return misses.length ? [{ hour: hr.hour, misses, wrote: written.has(hr.hour) ? change(asOf(hr.hour - 1), written.get(hr.hour)!) : null }] : [];
  });

  // right the previous time this kind came up, wrong now: the change he read is the one written after the hour before
  const setbacks: Setback[] = [];
  for (const [kind, qs] of byKind) for (let i = 1; i < qs.length; i++) {
    const { hour, t } = qs[i];
    if (!t.holmes.ok && qs[i - 1].t.holmes.ok) setbacks.push({ hour, kind, rightAt: qs[i - 1].hour, read: change(asOf(hour - 2), asOf(hour - 1)) });
  }
  setbacks.sort((a, b) => a.hour - b.hour || a.kind.localeCompare(b.kind));

  // lines naming an event topic the factory never emits, with the first and last version that held them
  const wrong = new Map<string, WrongLine>();
  for (const n of [...notes].sort((a, b) => a.hour - b.hour)) for (const raw of n.text.split("\n")) {
    const line = raw.trim(), topic = line && checkLine(line);
    if (!topic) continue;
    const w = wrong.get(line);
    wrong.set(line, w ? { ...w, to: n.hour } : { line, topic, from: n.hour, to: n.hour });
  }

  const all = mistakes.flatMap((m) => m.misses);
  return {
    kinds, mistakes, setbacks, wrong: [...wrong.values()],
    totals: { misses: all.length, fixedNext: all.filter((m) => m.next?.ok).length, setbacks: setbacks.length, wrong: wrong.size },
  };
}
