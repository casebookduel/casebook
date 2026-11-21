import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData } from "viem";
import { boardOrder } from "./board.ts";
import { refused } from "./lessonRules.ts";
import { stringArg } from "./teachCall.ts";

const order = (es: { id: number; status: string; right: number; n: number }[]) => boardOrder(es).map((e) => e.id);

test("notebooks may span lines and run to 2,000 bytes; lessons may not", () => {
  assert.equal(refused("NOTES:\n- one\n- two", { max: 2000, lines: true }), null);
  assert.equal(refused("NOTES:\n- one"), "ascii");
  assert.equal(refused("a".repeat(2000), { max: 2000, lines: true }), null);
  assert.equal(refused("a".repeat(2001), { max: 2000, lines: true }), "long");
});

test("enter(string) calldata for a multi-line notebook matches viem", () => {
  const abi = [{ type: "function", name: "enter", stateMutability: "nonpayable", inputs: [{ name: "notebook", type: "string" }], outputs: [{ type: "uint256" }] }] as const;
  const nb = "NOTES:\n- Factory 0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e.\n" + "x".repeat(1900);
  assert.equal(encodeFunctionData({ abi, functionName: "enter", args: [nb] }).slice(10), stringArg(nb));
});

test("the board: played by share right, then the queue, then the refused", () => {
  assert.deepEqual(order([{ id: 1, status: "queued", right: 0, n: 0 }, { id: 2, status: "done", right: 100, n: 144 }, { id: 3, status: "filtered", right: 0, n: 0 },
    { id: 4, status: "playing", right: 30, n: 36 }, { id: 5, status: "playing", right: 25, n: 36 }]), [4, 2, 5, 1, 3]);
});
