import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrail, type TrailHour } from "./trail.ts";

const BAD = "0x" + "ab".repeat(32);       // a topic the factory never emits
const hour = (h: number, tasks: [string, boolean, boolean, boolean?][]): TrailHour => ({
  hour: h, tasks: tasks.map(([kind, ho, mo, retention]) => ({ kind, truth: "k", retention: !!retention, holmes: { ok: ho, answer: ho ? "k" : "x" }, moriarty: { ok: mo } })),
});
const hours = [
  hour(0, [["creator", false, false], ["tax", true, true]]),
  hour(1, [["creator", true, false], ["tax", true, false]]),
  hour(2, [["creator", true, true], ["tax", false, true]]),
  hour(3, [["creator", false, false], ["tax", true, false, true]]),
];
const notes = [
  { hour: 0, text: "A" },
  { hour: 1, text: `A\nB\nbad ${BAD}` },
  { hour: 2, text: `A\nB\nbad ${BAD}` },
  // no notes after hour 3 yet
];
const t = buildTrail(hours, notes);

test("each kind: cells in hour order, totals and the current streak", () => {
  const creator = t.kinds.find((k) => k.kind === "creator")!;
  assert.deepEqual(creator.cells.map((c) => [c.hour, c.h, c.m]), [[0, false, false], [1, true, false], [2, true, true], [3, false, false]]);
  assert.deepEqual([creator.holmes, creator.moriarty, creator.n, creator.streak], [2, 1, 4, 0]);
  const tax = t.kinds.find((k) => k.kind === "tax")!;
  assert.equal(tax.streak, 1);
  assert.equal(tax.cells[3].retention, true);
});

test("a miss carries what he wrote after that hour and how the next question of its kind went", () => {
  const h0 = t.mistakes.find((m) => m.hour === 0)!;
  assert.deepEqual(h0.wrote, { add: ["A"], del: [] });                 // first notebook: everything is new
  assert.deepEqual(h0.misses, [{ kind: "creator", answer: "x", truth: "k", next: { hour: 1, ok: true } }]);
  const h2 = t.mistakes.find((m) => m.hour === 2)!;
  assert.deepEqual(h2.wrote, { add: [], del: [] });                    // he kept the notebook as it was
  assert.deepEqual(h2.misses[0].next, { hour: 3, ok: true });
  const h3 = t.mistakes.find((m) => m.hour === 3)!;
  assert.equal(h3.wrote, null);                                        // not written yet
  assert.equal(h3.misses[0].next, null);                               // not asked again yet
});

test("a setback shows the change he read before missing a kind he had right the time before", () => {
  assert.deepEqual(t.setbacks.map((s) => [s.hour, s.kind, s.rightAt]), [[2, "tax", 1], [3, "creator", 2]]);
  // hour 2 read the notes written after hour 1; the change against the version before is what he read new
  assert.deepEqual(t.setbacks[0].read, { add: ["B", `bad ${BAD}`], del: [] });
  assert.deepEqual(t.setbacks[1].read, { add: [], del: [] });
});

test("lines wrong on chain are listed once, with the versions that held them", () => {
  assert.deepEqual(t.wrong, [{ line: `bad ${BAD}`, topic: BAD.slice(0, 10), from: 1, to: 2 }]);
});

test("totals add up", () => {
  assert.deepEqual(t.totals, { misses: 3, fixedNext: 2, setbacks: 2, wrong: 1 });   // creator h0, tax h2, creator h3
});

test("no hours, no notes", () => {
  assert.deepEqual(buildTrail([], []), { kinds: [], mistakes: [], setbacks: [], wrong: [], totals: { misses: 0, fixedNext: 0, setbacks: 0, wrong: 0 } });
});
