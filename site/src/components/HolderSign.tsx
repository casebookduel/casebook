"use client";
// The holder check for the files: one signed message from a browser wallet (no transaction), checked by /api/holder
// against the chain; on success the page reloads its data with the holder cookie and the files turn live.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmt } from "@/i18n/config";
import type { Dict } from "@/i18n/en";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const hex = (s: string) => [...new TextEncoder().encode(s)].map((x) => x.toString(16).padStart(2, "0")).join("");

export default function HolderSign({ offer, min, t }: { offer: string; min: number; t: Dict["holder"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function sign() {
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) { setMsg(t.noWallet); return; }
    setBusy(true); setMsg(t.signing);
    try {
      const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const { message } = (await fetch(`/api/holder?address=${address}`, { cache: "no-store" }).then((r) => r.json())) as { message: string };
      const signature = await eth.request({ method: "personal_sign", params: ["0x" + hex(message), address] });
      const r = (await fetch("/api/holder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, signature }) }).then((x) => x.json())) as { ok?: boolean; why?: string; balance?: string; min?: number };
      if (r.ok) { setMsg(""); router.refresh(); }
      else setMsg(r.why === "balance" ? fmt(t.low, { b: Number(r.balance ?? 0).toLocaleString("en-US"), min: (r.min ?? min).toLocaleString("en-US") }) : t.fail);
    } catch {
      setMsg(t.fail);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="case-holder files-holder">
      <p className="dim">{offer}</p>
      <button type="button" className="btn btn-line btn-sm" onClick={sign} disabled={busy}>{t.connect}</button>
      <p className="dim case-holder-note" role="status">{msg || t.note}</p>
    </div>
  );
}
