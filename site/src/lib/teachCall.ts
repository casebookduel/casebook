// Calldata for the two wallet transactions and the reads around them, built without a wallet library so the client
// stays small. The selectors are computed on the server (viem) and passed in; teachCall.test.ts checks every byte
// against viem's own encoder.
const word = (hex: string) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");

export const addressArg = (a: string) => word(a);
export const uintArg = (n: bigint) => word(n.toString(16));

// an ABI-encoded single string argument: offset, length, then the bytes padded to a whole word
export function stringArg(s: string): string {
  const hex = [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return word("20") + word((hex.length / 2).toString(16)) + hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
}
