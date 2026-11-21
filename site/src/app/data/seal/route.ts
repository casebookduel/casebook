// Every closed hour with the SHA-256 of its sealed bytes, and the seal tx once the sealer has sent it: /data/seal
import { connection } from "next/server";
import { RPC_URL, SEAL_CONTRACT, sealIndex } from "@/lib/seal";

export async function GET() {
  await connection();   // read the files at request time: the sealer polls this
  return Response.json({
    contract: SEAL_CONTRACT || null, chainId: 4663, rpc: RPC_URL,
    covers: "SHA-256 of /data/seal/<hour>: the hour's rows of results.jsonl exactly as written, then notes_hNN.md (the notebook Holmes wrote after the hour), if any",
    hours: sealIndex(),
  }, { headers: { "cache-control": "no-store" } });
}
