"use client";
// The record as a working panel: every hour on the left, the chosen hour's chart position and its questions on the right.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Arrow } from "./Icons";
import Linked, { addrLink } from "./Linked";
import { Mark } from "./Ticket";
import { pText } from "@/lib/facts";
import { fmt, HTML_LANG, lp, pf, type Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/en";
import type { HourLite } from "@/lib/duel";

const TM = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
const clock = (ts: number) => `${TM.format(ts * 1000)} UTC`;
const SPAN = 48;
const short = (s: string | null, none = "no answer") => (!s ? none : s.startsWith("0x") && s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

// Hours can hold different numbers of questions once levels run, so the axis is the share answered right.
function Chart({ hours, sel, onPick, tag, pc }: { hours: HourLite[]; sel: number; onPick: (i: number) => void; tag?: string; pc: (x: number) => string }) {
  // the axis labels keep about 12 px on screen however narrow the chart is drawn (u: viewBox units per CSS pixel),
  // and the margins grow with them
  const ref = useRef<SVGSVGElement>(null), [u, setU] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // a hidden chart measures 0 px wide: keep the last scale instead of blowing the labels up to the whole viewBox
    const ro = new ResizeObserver(() => { const w = el.getBoundingClientRect().width; if (w > 0) setU(1000 / w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fs = Math.max(13, 12 * u), cw = 0.7 * fs;   // font size and a mono character's width, in viewBox units
  const W = 1000, H = 230, L = Math.max(76, pc(1).length * cw + 14), R = 14, T = 16, B = Math.max(30, fs + 14), n = Math.max(1, hours.length - 1);
  const x = (i: number) => L + ((W - L - R) * i) / n, y = (v: number, of: number) => T + (H - T - B) * (1 - v / Math.max(1, of));
  const line = (k: "holmes" | "moriarty") => hours.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h[k], h.n).toFixed(1)}`).join(" ");
  const v1 = hours.filter((h) => h.rule === "v1").length;
  // hour numbers on a round step; a phone keeps only the coarser step (the others get "pm" and hide there)
  const step = (most: number) => [1, 2, 6].find((s) => hours.length / s <= most) ?? 12;
  const kd = step(24), kp = step(10);
  return (
    <svg ref={ref} className="rp-chart" viewBox={`0 0 ${W} ${H}`} style={{ fontSize: fs }} role="img" aria-label="Share of questions right per hour: Holmes in emerald, Moriarty in silver">
      {v1 > 0 && <rect x={L} y={T} width={Math.max(0, x(v1 - 1) - L + (W - L - R) / n / 2)} height={H - T - B} className="v1zone" />}
      {[0, 0.5, 1].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v, 1)} y2={y(v, 1)} className="grid" />{v > 0 && <text x={L - 10} y={y(v, 1) + fs * 0.32} className="axis y" textAnchor="end">{pc(v)}</text>}</g>)}
      {tag && hours.map((h, i) => {
        if (!i || h.level === hours[i - 1].level) return null;
        const m = (x(i - 1) + x(i)) / 2, end = m > W - R - 60;
        return <g key={`lv${h.hour}`} className="lvmark"><line x1={m} x2={m} y1={T} y2={H - B} /><text x={end ? m - 6 : m + 6} y={T + 12} className="axis" textAnchor={end ? "end" : "start"}>{fmt(tag, { n: h.level })}</text></g>;
      })}
      <line x1={x(sel)} x2={x(sel)} y1={T} y2={H - B} className="selline" />
      <path d={line("moriarty")} className="ln-m" /><path d={line("holmes")} className="ln-h" />
      {hours.map((h, i) => (
        <g key={h.hour} onClick={() => onPick(i)} className="pt">
          <rect x={x(i) - 18} y={T} width={36} height={H - T - B} fill="transparent" />
          <circle cx={x(i)} cy={y(h.moriarty, h.n)} r={i === sel ? 6 : 4} className="dot-m" />
          <circle cx={x(i)} cy={y(h.holmes, h.n)} r={i === sel ? 6 : 4} className="dot-h" />
          {/* a label that would run past the right edge ends at it instead */}
          {h.hour % kd === 0 && <text x={x(i)} y={H - 8} className={`axis${i === sel ? " on" : ""}${h.hour % kp ? " pm" : ""}`} textAnchor={x(i) + (String(h.hour).length * cw) / 2 > W ? "end" : "middle"}>{h.hour}</text>}
        </g>
      ))}
    </svg>
  );
}

type Stats = { from: number; holmes: number; moriarty: number; n: number; ahead: number; of: number; p: number };
type All = { hours: number; holmes: number; moriarty: number; n: number; ahead: number; tied: number; behind: number; missed: number };
// answers are data, kept in English; "no answer" is in the page's language (nl), also inside a cell marked lang="en"
const val = (s: string | null, none: string, nl?: string) => (s && /^0x[0-9a-fA-F]{40}$/.test(s) ? addrLink(s) : <span className={s ? "mono" : "dim"} lang={s ? undefined : nl}>{short(s, none)}</span>);

type KindTotal = { label: string; h: number; m: number; n: number };

// Hours that arrive without rows (older than the page carries) link to their own page instead of opening here.
export default function RecordPanel({ hours, kinds, stats, all, lang, t, levelTag }: { hours: HourLite[]; kinds: KindTotal[]; stats: Stats; all: All; lang: Locale; t: Dict["record"]; levelTag?: string }) {
  const [sel, setSel] = useState(hours.length - 1);
  const h = hours[sel];
  if (!h) return null;
  const P = pf(lang), pct = (a: number) => P(a / Math.max(1, stats.n));
  // the chart holds at most SPAN hours around the chosen one; the list beside it holds every hour
  const a0 = Math.max(0, Math.min(sel - SPAN / 2, hours.length - SPAN));
  return (
    <div className="panel record-panel">
      <div className="panel-bar rp-bar">
        <span className="mlabel">{fmt(t.all, { n: all.hours })}</span>
        <span><b className="holmes">Holmes {all.holmes}/{all.n}</b> <span className="dim">{P(all.holmes / Math.max(1, all.n))}</span></span>
        <span><b className="moriarty">Moriarty {all.moriarty}/{all.n}</b> <span className="dim">{P(all.moriarty / Math.max(1, all.n))}</span></span>
        <span>{fmt(t.ahead, { a: all.ahead, l: all.tied, b: all.behind })}</span>
        {all.missed > 0 && <Link className="dim" href={lp(lang, "/hours")}>{fmt(t.missed, { n: all.missed })}</Link>}
      </div>
      <div className="panel-bar rp-bar sub">
        <span className="mlabel">{fmt(t.from, { k: stats.from })}</span>
        <span className="dim">{fmt(t.fromLine, { h: pct(stats.holmes), m: pct(stats.moriarty), a: stats.ahead, o: stats.of, p: pText(stats.p) })}</span>
      </div>
      <div className="rp-kinds" aria-label={t.byKind}>
        {kinds.map((k) => (
          <div key={k.label}>
            <span className="mlabel">{k.label}</span>
            <span className="rp-kbar" aria-hidden="true"><i className="h" style={{ width: `${(100 * k.h) / k.n}%` }} /><i className="m" style={{ width: `${(100 * k.m) / k.n}%` }} /></span>
            <span className="rp-ks"><span className="holmes nowrap"><span aria-hidden="true">H </span><span className="sr">Holmes </span>{k.h}</span> · <span className="moriarty nowrap"><span aria-hidden="true">M </span><span className="sr">Moriarty </span>{k.m}</span> <span className="dim nowrap">{fmt(t.of, { n: k.n })}</span></span>
          </div>
        ))}
      </div>
      <div className="rp-grid">
        <ul className="rp-list" aria-label="Every hour" data-lenis-prevent>
          {[...hours].reverse().map((x) => {
            const i = hours.indexOf(x);
            return (
              <li key={x.hour}>
                {(() => {
                  const inner = <>
                    <span className="rp-h">{x.hour}</span>
                    <span className="rp-t">{clock(x.ts)}{x.rule === "v1" ? ` · ${t.firstRule}` : ""}{levelTag ? ` · ${fmt(levelTag, { n: x.level })}` : ""}</span>
                    <span className="rp-bars" aria-hidden="true"><i className="h" style={{ height: `${(100 * x.holmes) / x.n}%` }} /><i className="m" style={{ height: `${(100 * x.moriarty) / x.n}%` }} /></span>
                    <span className="rp-s"><span className="holmes">{x.holmes}</span>–<span className="moriarty">{x.moriarty}</span></span>
                  </>;
                  return x.rows.length
                    ? <button type="button" aria-pressed={i === sel} onClick={() => setSel(i)} className={x.rule}>{inner}</button>
                    : <Link prefetch={false} href={lp(lang, `/hours/${x.hour}`)} className={x.rule}>{inner}</Link>;
                })()}
              </li>
            );
          })}
        </ul>
        <div className="rp-detail">
          <Chart hours={hours.slice(a0, a0 + SPAN)} sel={sel - a0} onPick={(i) => setSel(a0 + i)} tag={levelTag} pc={P} />
          <div className="rp-head">
            <b>#{h.hour}</b><span className="dim">{clock(h.ts)}</span>
            <span><span className="holmes">Holmes {h.holmes}/{h.n}</span> · <span className="moriarty">Moriarty {h.moriarty}/{h.n}</span></span>
            <Link className="more" href={lp(lang, `/hours/${h.hour}`)}>{t.toolCalls} <Arrow size={15} /></Link>
          </div>
          <div className="scroll-x" data-lenis-prevent>
            <table className="rp-table">
              <thead><tr><th className="mlabel">{t.question}</th><th className="mlabel">{t.key}</th><th className="mlabel holmes" lang="en">Holmes</th><th className="mlabel moriarty" lang="en">Moriarty</th></tr></thead>
              <tbody key={h.hour}>
                {h.rows.map((r, k) => (
                  <tr key={k}>
                    <td><span className="mlabel">{r.label}</span><span className="rp-q"><Linked text={r.q} /></span></td>
                    <td className="key" data-l={t.key}>{val(r.truth, t.noAnswer)}</td>
                    <td data-l="Holmes" lang="en"><span className="vd"><Mark ok={r.h.ok} who="Holmes" />{val(r.h.a, t.noAnswer, HTML_LANG[lang])}</span></td>
                    <td data-l="Moriarty" lang="en"><span className="vd"><Mark ok={r.m.ok} who="Moriarty" />{val(r.m.a, t.noAnswer, HTML_LANG[lang])}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
