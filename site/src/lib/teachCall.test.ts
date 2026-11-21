import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, erc20Abi, toFunctionSelector } from "viem";
import { addressArg, stringArg, uintArg } from "./teachCall.ts";

const teachAbi = [{ type: "function", name: "teach", stateMutability: "nonpayable", inputs: [{ name: "lesson", type: "string" }], outputs: [{ type: "uint256" }] }] as const;
const A = "0x5FbDB2315678afecb367f032d93F642f64180aa3", B = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

test("teach(string) matches viem for short, word-sized and long lessons", () => {
  for (const s of ["x", "a".repeat(32), "Max getLogs span is 10,000,000 blocks; split longer ranges.", "b".repeat(280)])
    assert.equal(toFunctionSelector("teach(string)") + stringArg(s), encodeFunctionData({ abi: teachAbi, functionName: "teach", args: [s] }), s.slice(0, 12));
});

test("approve, allowance and balanceOf match viem", () => {
  const fee = 100_000n * 10n ** 18n;
  assert.equal(toFunctionSelector("approve(address,uint256)") + addressArg(B) + uintArg(fee), encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [B, fee] }));
  assert.equal(toFunctionSelector("allowance(address,address)") + addressArg(A) + addressArg(B), encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [A, B] }));
  assert.equal(toFunctionSelector("balanceOf(address)") + addressArg(A), encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [A] }));
});
