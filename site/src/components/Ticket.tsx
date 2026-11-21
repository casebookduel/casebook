"use client";
// The hero's scorecard: this hour's six questions, with the one the scene is replaying lit up.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Arrow, Check, Cross } from "./Icons";
import { fmt } from "@/i18n/config";
import type { HourLite } from "@/lib/duel";

export const Mark = ({ ok, who }: { ok: boolean; who: string }) => (
  <span className={ok ? "ok" : "no"}>{ok ? <Check size={15} label={who} /> : <Cross size={15} label={who} />}</span>
);

// a coarse clock (one tick a minute) read the React way, so the server and the first paint agree
const minute = { sub: (f: () => void) => { const id = window.setInterval(f, 60_000); return () => window.clearInterval(id); }, now: () => Math.floor(Date.now() / 60_000), server: () => 0 };
const UTC = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });

type T = { title: string; next: string; paused: string; question: string; replay: string; end: string; idle: string; transcripts: string };

type Lvl = { badge: string; next: string; now: string; pct: number | null };

export default function Ticket({ h, time, t, href, lvl }: { h: HourLite; time: string; t: T; href: string; lvl?: Lvl }) {
  const m = useSyncExternalStore(minute.sub, minute.now, minute.server);
  const age = m ? m * 60 - h.ts : 0;
  const live = !m ? time : age < 75 * 60 ? `${time} · ${fmt(t.next, { t: UTC.format((h.ts + 3600) * 1000) })}` : fmt(t.paused, { x: Math.round(age / 3600) });
  const [i, setI] = useState<number | null>(null);
  useEffect(() => {
    const on = (e: Event) => setI((e as CustomEvent<number>).detail);
    window.addEventListener("duel:exchange", on);
    return () => window.removeEventListener("duel:exchange", on);
  }, []);
  return (
    <div className="ticket">
      <div className="t-head"><span className="mlabel">{fmt(t.title, { h: h.hour })}</span><span className="mlabel">{live}</span></div>
      {lvl && (
        <div className="t-level">
          <span className="lv-chip">{lvl.badge}</span>
          <span className="t-lv-next">{lvl.next}</span>
          {lvl.pct !== null && <span className="t-lv-bar" aria-hidden="true"><i style={{ width: `${lvl.pct}%` }} /></span>}
          <span className="t-lv-now">{lvl.now}</span>
        </div>
      )}
      <div className="t-score">
        <div><span className="holmes">Holmes</span><b className="holmes">{h.holmes}<small>/{h.n}</small></b></div>
        <div><span className="moriarty">Moriarty</span><b className="moriarty">{h.moriarty}<small>/{h.n}</small></b></div>
      </div>
      <ol className="t-rows">
        <li className="t-cols" aria-hidden="true"><span>{t.question}</span><span>H</span><span>M</span></li>
        {h.rows.map((r, k) => (
          <li key={k} className={k === i ? "on" : undefined}>
            <span className="t-q">{r.label}</span><Mark ok={r.h.ok} who="Holmes" /><Mark ok={r.m.ok} who="Moriarty" />
          </li>
        ))}
      </ol>
      <div className="t-foot">
        <span className="mlabel" aria-hidden="true">{i === -1 ? t.end : i !== null && i >= 0 ? fmt(t.replay, { i: i + 1, n: h.n }) : t.idle}</span>
        <Link className="more" href={href}>{t.transcripts} <Arrow size={15} /></Link>
      </div>
    </div>
  );
}
