import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { toFunctionSelector } from "viem";

// the engine has no keccak (no dependencies), so its seals(uint256) selector is written out; check it here with viem
test("the engine's seals(uint256) selector matches viem", () => {
  const src = fs.readFileSync(new URL("../../../engine/src/holmes.ts", import.meta.url), "utf8");
  assert.equal(/SEALS_SELECTOR = "(0x[0-9a-f]{8})"/.exec(src)?.[1], toFunctionSelector("seals(uint256)"));
});
