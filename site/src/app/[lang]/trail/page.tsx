import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmt, hasLocale, lp } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getDuel, short } from "@/lib/duel";
import { OPEN } from "@/lib/open";
import { buildTrail, type Change } from "@/lib/trail";

// no title until it opens: a closed page must not name the feature
export async function generateMetadata(): Promise<Metadata> {
  return OPEN.has("trail") ? { title: "The learning trail" } : {};
}

const SHOWN = 72;   // questions per kind drawn as pairs; the totals count every one
const OPEN_MISSES = 10, OPEN_SETBACKS = 8;   // newest blocks shown open; the rest fold under "Earlier"

// the newest blocks, then the older ones folded
function Folded({ items, open, label }: { items: React.ReactNode[]; open: number; label: string }) {
  return <>{items.slice(0, open)}{items.length > open && <details className="trail-older"><summary>{label}</summary>{items.slice(open)}</details>}</>;
}

function Diff({ c }: { c: Change }) {
  return (
    <ul className="diff mono">
      {c.del.map((l, i) => <li key={`d${i}`} className="del"><span className="sr">dropped: </span>{l}</li>)}
      {c.add.map((l, i) => <li key={`a${i}`} className="add"><span className="sr">added: </span>{l}</li>)}
    </ul>
  );
}

export default async function Trail({ params }: PageProps<"/[lang]/trail">) {
  const { lang } = await params;
  if (!hasLocale(lang) || !OPEN.has("trail")) notFound();
  const [duel, dict] = await Promise.all([getDuel(), getDictionary(lang)]);
  const t = dict.trail, L = (p: string) => lp(lang, p);
  const kind = (k: string) => (dict.kinds as Record<string, string>)[k] ?? k;
  const tr = buildTrail(duel.hours, duel.notes);
  const lastNotes = duel.notes.at(-1)?.hour ?? -1;
  const changed = (c: Change) => c.add.length + c.del.length > 0;
  const hourLink = (h: number) => <h3><Link prefetch={false} href={L(`/hours/${h}`)}>{fmt(t.hourL, { h })}</Link></h3>;
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{t.kicker}</span><span className="mlabel">{fmt(t.count, { n: duel.hours.length })}</span></div>
        <h1 className="page-h1">{t.a}<span className="b">{t.b}</span></h1>
        <p className="lede">{t.lede}</p>
      </div>

      <dl className="trail-stats">
        <div><dt className="mlabel">{t.stats.misses}</dt><dd>{tr.totals.misses}</dd></div>
        <div><dt className="mlabel">{t.stats.fixed}</dt><dd>{tr.totals.fixedNext}</dd></div>
        <div><dt className="mlabel">{t.stats.setbacks}</dt><dd>{tr.totals.setbacks}</dd></div>
        <div><dt className="mlabel">{t.stats.wrong}</dt><dd>{tr.totals.wrong}</dd></div>
      </dl>

      <section className="trail-sect" aria-labelledby="kinds">
        <h2 id="kinds">{t.kinds}</h2>
        <p className="dim">{t.kindsNote}</p>
        {tr.kinds.map((k) => {
          const score = fmt(t.score, { h: k.holmes, m: k.moriarty, n: k.n });
          return (
            <div className="kind-row" key={k.kind}>
              <div>
                <h3>{kind(k.kind)}</h3>
                <p className="meta">{score}<br />{k.streak ? fmt(t.streak, { k: k.streak }) : t.missedLast}</p>
              </div>
              <div className="pairs" role="img" aria-label={score}>
                {k.cells.slice(-SHOWN).map((c, i) => (
                  <span key={i} className={c.retention ? "pair ret" : "pair"} title={`${fmt(t.hourL, { h: c.hour })} · Holmes ${c.h ? t.right : t.wrong} · Moriarty ${c.m ? t.right : t.wrong}`}>
                    <i className={c.h ? "h" : undefined} /><i className={c.m ? "m" : undefined} />
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {tr.kinds.some((k) => k.n > SHOWN) && <p className="dim">{fmt(t.last, { n: SHOWN })}</p>}
      </section>

      <section className="trail-sect" aria-labelledby="wrong">
        <h2 id="wrong">{t.wrongH}</h2>
        <p className="dim">{t.wrongNote}</p>
        {tr.wrong.length ? tr.wrong.map((w) => (
          <div className="version" key={w.line}>
            <p className="meta">{w.to === lastNotes ? fmt(t.wrongNow, { a: w.from }) : fmt(t.wrongSpan, { a: w.from, b: w.to })}</p>
            <p className="mono nb-bad trail-line">{w.line}</p>
          </div>
        )) : <p>{t.none}</p>}
      </section>

      <section className="trail-sect" aria-labelledby="misses">
        <h2 id="misses">{t.missH}</h2>
        {tr.mistakes.length ? <Folded open={OPEN_MISSES} label={fmt(t.earlier, { n: Math.max(0, tr.mistakes.length - OPEN_MISSES) })} items={[...tr.mistakes].reverse().map((m) => (
          <div className="version" key={m.hour}>
            <div>{hourLink(m.hour)}</div>
            <div>
              <ul className="trail-misses">
                {m.misses.map((x, i) => (
                  <li key={i}>
                    {x.answer ? fmt(t.missed, { k: kind(x.kind), a: short(x.answer), t: short(x.truth) }) : fmt(t.missedNone, { k: kind(x.kind), t: short(x.truth) })}{" "}
                    <span className="dim">{x.next ? fmt(t.next, { k: kind(x.kind), h: x.next.hour, r: x.next.ok ? t.right : t.wrong }) : t.notAgain}</span>
                  </li>
                ))}
              </ul>
              <p className="meta">{!m.wrote ? t.notYet : changed(m.wrote) ? t.wrote : t.kept}</p>
              {m.wrote && changed(m.wrote) && <Diff c={m.wrote} />}
            </div>
          </div>
        ))} /> : <p>{t.none}</p>}
      </section>

      <section className="trail-sect" aria-labelledby="setbacks">
        <h2 id="setbacks">{t.setH}</h2>
        <p className="dim">{t.setNote}</p>
        {tr.setbacks.length ? <Folded open={OPEN_SETBACKS} label={fmt(t.earlier, { n: Math.max(0, tr.setbacks.length - OPEN_SETBACKS) })} items={[...tr.setbacks].reverse().map((s) => (
          <div className="version" key={`${s.hour}-${s.kind}`}>
            <div>{hourLink(s.hour)}</div>
            <div>
              <p>{fmt(t.setback, { k: kind(s.kind), p: s.rightAt, h: s.hour })}</p>
              <p className="meta">{changed(s.read) ? t.read : t.same}</p>
              {changed(s.read) && <Diff c={s.read} />}
            </div>
          </div>
        ))} /> : <p>{t.none}</p>}
      </section>

      <p style={{ padding: "40px 0 96px", borderTop: "1px solid var(--line)" }}><a className="more" href="/data/trail.json">{t.raw}</a></p>
    </div>
  );
}
