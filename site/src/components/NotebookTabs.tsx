"use client";
// Three views of the same moment: what Holmes will read next hour, what Moriarty will read (nothing), and what changed.
import { useState } from "react";
import { checkLine } from "@/lib/facts";
import { Cross } from "./Icons";
import { fmt } from "@/i18n/config";
import type { Dict } from "@/i18n/en";

type Line = { l: string; k: string };
export default function NotebookTabs({ hour, text, diff, t }: { hour: number; text: string; diff: Line[]; t: Dict["memory"] }) {
  const [tab, setTab] = useState<"h" | "m" | "d">("h");
  const added = diff.filter((d) => d.k === "add").length, dropped = diff.filter((d) => d.k === "del").length;
  const T = (id: "h" | "m" | "d", label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
  );
  return (
    <div className="panel nb-panel">
      <div className="panel-bar nb-tabs" role="tablist">
        {T("h", t.tabH)}{T("m", t.tabM)}{T("d", fmt(t.tabD, { h: hour }))}
        <span className="mlabel nb-file">{tab === "m" ? t.nothing : fmt(t.file, { h: String(hour).padStart(2, "0"), c: text.length.toLocaleString("en-US") })}</span>
      </div>
      {tab === "h" && (
        <div className="nb-page h" key="h">
          {text.split("\n").some((l) => checkLine(l)) && <p className="nb-check"><Cross size={16} label="" /> {t.check}</p>}
          <pre className="notes mono" data-lenis-prevent>{text.split("\n").map((l, i) => { const bad = checkLine(l); return bad ? <span key={i} className="nb-bad" title={fmt(t.bad, { x: bad })}>{l}{"\n"}</span> : <span key={i}>{l}{"\n"}</span>; })}</pre>
        </div>
      )}
      {tab === "m" && (
        <div className="nb-page m" key="m">
          <p className="nb-empty">{t.empty}</p>
          <p>{t.mText}</p>
          <div className="rules" aria-hidden="true" />
        </div>
      )}
      {tab === "d" && (
        <div className="nb-page d" key="d">
          <p className="dim nb-sum">{fmt(t.sum, { a: added, d: dropped })}</p>
          <ul className="diff mono">{diff.map((r, i) => <li key={i} className={r.k}>{r.k === "add" ? <span className="sr">added: </span> : r.k === "del" ? <span className="sr">dropped: </span> : null}{r.l}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
