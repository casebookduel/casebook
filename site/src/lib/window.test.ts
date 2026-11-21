import { test } from "node:test";
import assert from "node:assert/strict";
import { busyUntil } from "./window.ts";

// an hour that began at t=0, wrote its last row at 600 and its notes after that
const T0 = 1_000_000;
test("rows but no notes yet: busy until 10 minutes after the last row", () => {
  assert.equal(busyUntil(T0, T0 + 600, false, T0 + 700), T0 + 1200);
});
test("notes written and the next hour far off: open", () => {
  assert.equal(busyUntil(T0, T0 + 600, true, T0 + 1800), null);
});
test("from 3 minutes before the next hour until 3 minutes after it should be graded: busy", () => {
  const took = 660, until = T0 + 3600 + took + 180;
  assert.equal(busyUntil(T0, T0 + 600, true, T0 + 3600 - 180), until);
  assert.equal(busyUntil(T0, T0 + 600, true, until), until);
  assert.equal(busyUntil(T0, T0 + 600, true, until + 1), null);
});
test("a short hour still pauses for at least 5 minutes plus the margins", () => {
  assert.equal(busyUntil(T0, T0 + 30, true, T0 + 3600), T0 + 3600 + 300 + 180);
});
test("an old hour without notes (a stuck runner) does not pause cases forever", () => {
  assert.equal(busyUntil(T0, T0 + 600, false, T0 + 600 + 1200), null);
});
