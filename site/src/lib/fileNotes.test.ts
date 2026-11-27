import { test } from "node:test";
import assert from "node:assert/strict";
import { dur, notesOf } from "./fileNotes.ts";
import type { LaunchFile } from "./files.ts";

const base: LaunchFile = {
  token: "0x1", curve: "0x2", creator: "0x3", block: 1, ts: 1_000, symbol: "X", name: "X", first_buyer: null, first_buy_s: null,
  dev_sell_s: null, dev_sells: 0, buys: 1, sells: 0, grad_ts: null, trades_seen: true, first_buyer_sniper: null,
  creator_record: { n24: 1, n7: 1, n30: 1, first_seen: 1_000, grads: 0, earlier: 0, sold_on: 0, sold_60: 0, sold_median_s: null, settled: 0, no_buyer: 0, recent: [] },
};
const keys = (f: LaunchFile) => notesOf(f).map((n) => n.key);

test("a first launch says only that", () => {
  assert.deepEqual(keys(base), ["nFirst"]);
});
test("a serial launcher who sold fast, never graduated, and a sniper first in", () => {
  const f = { ...base, dev_sell_s: 23, first_buyer: "0x9", first_buyer_sniper: { rank: 2, n: 58 },
    creator_record: { ...base.creator_record, n24: 47, n7: 57, n30: 67, earlier: 46, sold_on: 3, sold_median_s: 190, settled: 46, no_buyer: 28 } };
  assert.deepEqual(keys(f), ["nSerial", "nDevSold", "nSold", "nNoGrad", "nNoBuyers", "nSniper"]);
  assert.ok(notesOf(f).every((n) => n.tone === "bad"));
});
test("a dev with graduations gets the good note, not the none-graduated one", () => {
  const f = { ...base, creator_record: { ...base.creator_record, n30: 4, grads: 2 } };
  assert.deepEqual(notesOf(f).map((n) => [n.key, n.tone]), [["nGrad", "good"]]);
});
test("durations read in seconds, minutes, then hours", () => {
  assert.deepEqual([dur(43), dur(600), dur(7200)], [{ n: 43, u: "s" }, { n: 10, u: "m" }, { n: 2, u: "h" }]);
});
test("a few graduations among many launches are not a good sign, and a busy week is named", () => {
  const f = { ...base, creator_record: { ...base.creator_record, n7: 30, n30: 123, grads: 2 } };
  assert.deepEqual(notesOf(f).map((n) => [n.key, n.tone]), [["nSerial7", "bad"], ["nGrad", "plain"]]);
});
