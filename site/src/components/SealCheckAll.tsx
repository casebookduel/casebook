"use client";
import { useState } from "react";

type Labels = { check: string; checking: string; ok: string; bad: string; pending: string; error: string };
type Result = { ok: number; bad: number[]; pending: number[]; s: number } | { error: true };

const hex = (b: ArrayBuffer) => "0x" + [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const list = (h: number[]) => (h.length > 12 ? `${h.slice(0, 12).join(", ")}…` : h.join(", "));

// Every closed hour at once, the same check as the button on each hour page: hash the bytes this site serves for the
// hour, read the root from the contract through the public RPC (20 calls per request), compare.
export default function SealCheckAll({ contract, rpc, selector, t }: { contract: string; rpc: string; selector: string; t: Labels }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  async function run() {
    const t0 = performance.now();
    setRes(null);
    setBusy(t.checking.replace("{i}", "0").replace("{n}", "…"));
    try {
      const idx = (await fetch("/data/seal", { cache: "no-store" }).then((r) => r.json())) as { hours: { hour: number }[] };
      const hours = idx.hours.map((h) => h.hour);
      const roots = new Map<number, string>();
      for (let i = 0; i < hours.length; i += 20) {
        const body = hours.slice(i, i + 20).map((h) => ({ jsonrpc: "2.0", id: h, method: "eth_call", params: [{ to: contract, data: selector + h.toString(16).padStart(64, "0") }, "latest"] }));
        const reply: unknown = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
        if (!Array.isArray(reply)) throw new Error("rpc");
        for (const r of reply as { id: number; result?: string }[]) { if (!r.result) throw new Error("rpc"); roots.set(r.id, r.result.toLowerCase()); }
      }
      let done = 0, ok = 0;
      const bad: number[] = [], pending: number[] = [], queue = [...hours];
      const worker = async () => {
        for (let h = queue.shift(); h !== undefined; h = queue.shift()) {
          const bytes = await fetch(`/data/seal/${h}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("data"); return r.arrayBuffer(); });
          const mine = hex(await crypto.subtle.digest("SHA-256", bytes)), chain = roots.get(h);
          if (!chain) throw new Error("rpc");
          if (/^0x0{64}$/.test(chain)) pending.push(h); else if (chain === mine) ok++; else bad.push(h);
          setBusy(t.checking.replace("{i}", String(++done)).replace("{n}", String(hours.length)));
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      setRes({ ok, bad: bad.sort((a, b) => a - b), pending: pending.sort((a, b) => a - b), s: Math.round((performance.now() - t0) / 100) / 10 });
    } catch {
      setRes({ error: true });
    }
    setBusy(null);
  }

  return (
    <div className="seal-check" aria-live="polite">
      <button type="button" className="btn btn-line btn-sm" onClick={run} disabled={busy !== null}>{busy ?? t.check}</button>
      {res && ("error" in res ? <p className="seal-res no">{t.error}</p> : (
        <div className={`seal-res ${res.bad.length ? "no" : "ok"}`}>
          {res.bad.length > 0 && <p><b>{t.bad.replace("{list}", list(res.bad))}</b></p>}
          {res.ok > 0 && <p><b>{t.ok.replace("{k}", String(res.ok)).replace("{s}", String(res.s))}</b></p>}
          {res.pending.length > 0 && <p className="mono">{t.pending.replace("{list}", list(res.pending))}</p>}
        </div>
      ))}
    </div>
  );
}
