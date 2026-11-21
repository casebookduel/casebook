"use client";
// The token address in the hero: one tap copies it in full, the explorer link sits next to it.
import { useState } from "react";
import { Check, Copy } from "./Icons";
import { EXPLORER } from "@/lib/explorer";

export default function CopyCa({ ca, label }: { ca: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard?.writeText(ca).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }, () => {});
  return (
    <div className="ca-row">
      <button type="button" className="ca-chip" onClick={copy} aria-label={`${label} ${ca}`}>
        <span className="mlabel">{label}</span>
        <span className="mono">{ca.slice(0, 8)}…{ca.slice(-6)}</span>
        {done ? <Check size={15} label="copied" /> : <Copy size={15} />}
      </button>
      <a className="ca-link mono" href={`${EXPLORER}/token/${ca}`} target="_blank" rel="noreferrer">explorer</a>
    </div>
  );
}
