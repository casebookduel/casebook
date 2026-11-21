"use client";
// The token address in the hero: the whole address (shortened on a phone), one tap copies it, the explorer beside it.
import { useState } from "react";
import { Check, Copy } from "./Icons";
import { EXPLORER } from "@/lib/explorer";

export default function CopyCa({ ca, label, where = "" }: { ca: string; label: string; where?: string }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard?.writeText(ca).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1600); }, () => {});
  return (
    <div className={`ca-row ${where}`}>
      <span className="ca-live"><i aria-hidden="true" />{label}</span>
      <button type="button" className={`ca-chip${done ? " done" : ""}`} onClick={copy} aria-label={`${label} ${ca}`}>
        <span className="mono ca-full">{ca}</span>
        <span className="mono ca-short" aria-hidden="true">{ca.slice(0, 8)}…{ca.slice(-6)}</span>
        <span className="ca-act">{done ? <Check size={15} label="copied" /> : <Copy size={15} />}</span>
      </button>
      <a className="ca-link mono" href={`${EXPLORER}/token/${ca}`} target="_blank" rel="noreferrer">explorer ↗</a>
    </div>
  );
}
