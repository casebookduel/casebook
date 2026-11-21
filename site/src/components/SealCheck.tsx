"use client";
import { useState } from "react";

type Labels = { check: string; checking: string; bytes: string; chain: string; match: string; mismatch: string; unsealed: string; error: string };
type Result = { kind: "match" | "mismatch" | "unsealed"; bytes: number; mine: string; theirs: string } | { kind: "error" };

const hex = (b: ArrayBuffer) => "0x" + [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

// Checks one hour's seal in the browser: hashes the bytes this site serves for the hour, reads the root from the
// contract through the public RPC, and compares the two. Neither value comes from this site's word.
export default function SealCheck({ hour, contract, data, rpc, t }: { hour: number; contract: string; data: string; rpc: string; t: Labels }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setRes(null);
    try {
      const [bytes, chain] = await Promise.all([
        fetch(`/data/seal/${hour}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("data"); return r.arrayBuffer(); }),
        fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contract, data }, "latest"] }) })
          .then((r) => r.json()).then((j: { result?: string }) => { if (!j.result) throw new Error("rpc"); return j.result.toLowerCase(); }),
      ]);
      const mine = hex(await crypto.subtle.digest("SHA-256", bytes));
      const kind = /^0x0{64}$/.test(chain) ? "unsealed" : chain === mine ? "match" : "mismatch";
      setRes({ kind, bytes: bytes.byteLength, mine, theirs: chain });
    } catch {
      setRes({ kind: "error" });
    }
    setBusy(false);
  }

  return (
    <div className="seal-check" aria-live="polite">
      <button type="button" className="btn btn-line btn-sm" onClick={run} disabled={busy}>{busy ? t.checking : t.check}</button>
      {res && (res.kind === "error" ? <p className="seal-res no">{t.error}</p> : (
        <div className={`seal-res ${res.kind === "match" ? "ok" : "no"}`}>
          <p className="mono">{t.bytes.replace("{n}", res.bytes.toLocaleString("en-US")).replace("{h}", short(res.mine))}</p>
          {res.kind !== "unsealed" && <p className="mono">{t.chain.replace("{r}", short(res.theirs))}</p>}
          <p><b>{res.kind === "match" ? t.match : res.kind === "mismatch" ? t.mismatch : t.unsealed}</b></p>
        </div>
      ))}
    </div>
  );
}
