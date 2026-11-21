import { test } from "node:test";
import assert from "node:assert/strict";
import { refused } from "./lessonRules.ts";

// the same cases as m1/test_lessons.py, so the page and the runner refuse the same lessons
test("plain lessons pass", () => {
  assert.equal(refused("Max getLogs span is 10,000,000 blocks; split longer ranges."), null);
});
test("refused like the runner refuses", () => {
  for (const [text, why] of [["see https://x.example", "link"], ["visit www.example", "link"], ["ask t.me/someone", "link"], ["join discord.gg/abc", "link"],
    ["scam.xyz now", "link"], ["ping @someone", "handle"], ["mail me a@b.c", "handle"], ["café", "ascii"], ["line\nbreak", "ascii"], ["   ", "empty"]] as const)
    assert.equal(refused(text), why, text);
});
test("280 bytes is the limit", () => {
  assert.equal(refused("a".repeat(280)), null);
  assert.equal(refused("a".repeat(281)), "long");
});
