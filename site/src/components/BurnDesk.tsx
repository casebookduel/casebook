"use client";
// The burn form behind Teach Holmes and the notebook league. A text, checked against the published rules first so
// nobody burns for text the runner will not play, then two wallet transactions on Robinhood Chain: approve the fee (only
// when the allowance is short), then the contract call that burns it. No wallet library: the page speaks EIP-1193 to
// whatever wallet the browser has.
import { useState } from "react";
import { fmt } from "@/i18n/config";
import { refused } from "@/lib/lessonRules";
import { addressArg, stringArg, uintArg } from "@/lib/teachCall";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type Receipt = { status: string; logs: { address: string; topics: string[] }[] };
type Labels = { label: string; ph: string; count: string; go: string; connecting: string; switching: string; approving: string; sending: string;
  done: string; short: string; noWallet: string; failed: string; why: Record<string, string> };
type Props = { contract: string; token: string; fee: string; feeText: string; rpc: string; explorer: string;
  calls: { approve: string; allowance: string; balanceOf: string; fn: string; event: string }; max: number; lines?: boolean; rows?: number; t: Labels };

const CHAIN = "0x1237";   // 4663

async function receipt(eth: Eth, hash: string): Promise<Receipt> {
  for (let i = 0; i < 90; i++) {
    const r = (await eth.request({ method: "eth_getTransactionReceipt", params: [hash] })) as Receipt | null;
    if (r) { if (r.status !== "0x1") throw new Error("reverted"); return r; }
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  throw new Error("timeout");
}

export default function BurnDesk({ contract, token, fee, feeText, rpc, explorer, calls, max, lines = false, rows = 3, t }: Props) {
  const [text, setText] = useState("");
  const [step, setStep] = useState<null | "connecting" | "switching" | "approving" | "sending">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const bytes = new TextEncoder().encode(text).length, why = text ? refused(text, { max, lines }) : "empty";
  const f = { fee: feeText };

  async function go() {
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) return setMsg({ ok: false, text: t.noWallet });
    setMsg(null);
    try {
      setStep("connecting");
      const [from] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if ((await eth.request({ method: "eth_chainId" })) !== CHAIN) {
        setStep("switching");
        try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN }] }); }
        catch (e) {
          if ((e as { code?: number }).code !== 4902) throw e;
          await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN, chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [rpc], blockExplorerUrls: [explorer] }] });
        }
      }
      const read = async (data: string) => BigInt((await eth.request({ method: "eth_call", params: [{ to: token, data }, "latest"] })) as string);
      const need = BigInt(fee);
      if ((await read(calls.balanceOf + addressArg(from))) < need) { setStep(null); return setMsg({ ok: false, text: fmt(t.short, f) }); }
      if ((await read(calls.allowance + addressArg(from) + addressArg(contract))) < need) {
        setStep("approving");
        await receipt(eth, (await eth.request({ method: "eth_sendTransaction", params: [{ from, to: token, data: calls.approve + addressArg(contract) + uintArg(need) }] })) as string);
      }
      setStep("sending");
      const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from, to: contract, data: calls.fn + stringArg(text) }] })) as string;
      const rc = await receipt(eth, hash);
      const log = rc.logs.find((l) => l.address.toLowerCase() === contract.toLowerCase() && l.topics[0] === calls.event);
      setMsg({ ok: true, text: fmt(t.done, { id: log ? Number(BigInt(log.topics[1])) : "?" }), tx: hash });
      setText("");
    } catch {
      setMsg({ ok: false, text: t.failed });
    }
    setStep(null);
  }

  return (
    <div className="burn-desk panel">
      <label className="burn-field">
        <span className="mlabel">{t.label}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t.ph} rows={rows} maxLength={max} data-lenis-prevent />
      </label>
      <div className="burn-go">
        <button type="button" className="btn btn-solid" onClick={go} disabled={!!why || step !== null}>{step ? fmt(t[step], f) : fmt(t.go, f)}</button>
        <span className={why && text ? "burn-why no" : "burn-why"}>{why && text ? t.why[why] : fmt(t.count, { n: bytes })}</span>
      </div>
      {msg && (
        <p className={msg.ok ? "burn-msg ok" : "burn-msg no"} aria-live="polite">
          {msg.text}{msg.tx && <> <a href={`${explorer}/tx/${msg.tx}`} target="_blank" rel="noreferrer">{msg.tx.slice(0, 10)}…</a></>}
        </p>
      )}
    </div>
  );
}
