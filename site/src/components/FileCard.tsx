// One launch's file: its symbol, Holmes's notes (the facts worth reading first) and the plain facts under them: the dev
// and its record, the first buyer, whether the dev sold, the trades. Pure: the feed (client) and the file page (server)
// both draw it, so it imports only types and pure helpers.
import Link from "next/link";
import { fmt } from "@/i18n/config";
import type { Dict } from "@/i18n/en";
import type { LaunchFile } from "@/lib/files";
import { dur, notesOf } from "@/lib/fileNotes";

type T = Dict["files"];
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const span = (t: T, s: number) => { const d = dur(Math.max(0, s)); return fmt(t[d.u], { n: d.n }); };
export const ago = (t: T, s: number) => fmt(t.ago, { t: s < 86_400 ? span(t, s) : fmt(t.d, { n: Math.round(s / 86_400) }) });
export const noteText = (t: T, key: keyof T, v: Record<string, number>) => fmt(t[key], { ...v, ...(v.secs != null ? { t: span(t, v.secs) } : {}) });

export function Notes({ f, t, max = 9 }: { f: LaunchFile; t: T; max?: number }) {
  const ns = notesOf(f).slice(0, max);
  if (!ns.length) return null;
  return (
    <ul className="fnotes" aria-label={t.notes}>
      {ns.map((n) => <li key={n.key} className={`fnote ${n.tone}`}>{noteText(t, n.key, n.v)}</li>)}
    </ul>
  );
}

export default function FileCard({ f, t, now, href, fresh }: { f: LaunchFile; t: T; now: number; href?: string; fresh?: boolean }) {
  const c = f.creator_record, sn = f.first_buyer_sniper;
  const title = <><span className="fsym">{f.symbol || short(f.token)}</span>{f.name && f.name !== f.symbol && <span className="fname">{f.name}</span>}</>;
  return (
    <article className={`fcard${fresh ? " fresh" : ""}`}>
      <header className="fcard-top">
        {href ? <Link href={href} className="fcard-title">{title}</Link> : <span className="fcard-title">{title}</span>}
        <span className="mlabel fwhen">{ago(t, now - f.ts)}</span>
      </header>
      <Notes f={f} t={t} max={3} />
      <dl className="ffacts">
        <div><dt className="mlabel">{t.dev}</dt><dd><span className="mono">{short(f.creator)}</span> <span className={c.n24 >= 3 ? "warn" : "dim"}>{fmt(t.record, { a: c.n24, b: c.n7, c: c.n30 })}</span></dd></div>
        <div><dt className="mlabel">{t.firstBuyer}</dt><dd>{f.first_buyer
          ? <><span className="mono">{short(f.first_buyer)}</span> <span className="dim">{fmt(t.soldAt, { t: span(t, f.first_buy_s ?? 0) })}</span>{sn && <> <span className="fbadge warn">{fmt(t.sniper, { r: sn.rank })}</span></>}</>
          : <span className="dim">{t.noBuyer}</span>}</dd></div>
        <div><dt className="mlabel">{t.devSold}</dt><dd>{f.dev_sell_s != null
          ? <span className={f.dev_sell_s <= 300 ? "warn" : ""}>{fmt(t.soldAt, { t: span(t, f.dev_sell_s) })}</span>
          : <span className="dim">{t.notYet}</span>}</dd></div>
        <div><dt className="mlabel">{t.trades}</dt><dd><span className="dim">{fmt(t.buysSells, { b: f.buys, s: f.sells })}</span>{f.grad_ts != null && <> <span className="fbadge good">{t.graduated}</span></>}</dd></div>
      </dl>
      {href && <Link href={href} className="fopen mlabel">{t.open} →</Link>}
    </article>
  );
}
