import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BurnDesk from "@/components/BurnDesk";
import { fmt, hasLocale, lp } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { EXPLORER } from "@/lib/explorer";
import { CALLS, getLessons, TEACH_ON, type Lesson } from "@/lib/lessons";
import { RPC_URL } from "@/lib/seal";

// no title until it opens: a closed page must not name the feature
export async function generateMetadata(): Promise<Metadata> {
  return TEACH_ON ? { title: "Teach Holmes" } : {};
}

const N = new Intl.NumberFormat("en-US");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default async function Teach({ params }: PageProps<"/[lang]/teach">) {
  const { lang } = await params;
  if (!hasLocale(lang) || !TEACH_ON) notFound();
  const [d, dict] = await Promise.all([getLessons(), getDictionary(lang)]);
  const t = dict.teach, L = (p: string) => lp(lang, p);
  const fee = N.format(Number(d.feeText));
  const kept = d.taught.map((id) => d.lessons.find((l) => l.id === id)).filter((l): l is Lesson => !!l);
  const [hBefore, hAfter] = t.hoursL.split("{h}");
  const row = (l: Lesson) => (
    <div className="version" key={l.id}>
      <div>
        <h3>#{l.id}</h3>
        <p className="meta"><span className={`lesson-st ${l.status}`}>{t.status[l.status]}</span><br />{fmt(t.by, { a: short(l.teacher) })}</p>
      </div>
      <div>
        {l.status === "filtered"
          ? <p className="dim">{fmt(t.hidden, { why: ((t.why as Record<string, string>)[l.why ?? ""] ?? l.why ?? "").replace(/[.。]$/, "") })}</p>
          : <p className="lesson-text">{l.text}</p>}
        {l.n > 0 && (
          <p className="meta">
            {fmt(t.result, { w: l.with_ok, h: l.without_ok, n: l.n })} · {hBefore}
            {l.hours.map((h, i) => <span key={h}>{i ? ", " : ""}<Link prefetch={false} href={L(`/hours/${h}`)}>{h}</Link></span>)}{hAfter}
          </p>
        )}
        {l.tx && <p className="meta"><a href={`${EXPLORER}/tx/${l.tx}`} target="_blank" rel="noreferrer">{t.tx}</a></p>}
      </div>
    </div>
  );
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{t.kicker}</span><a className="mlabel" href={`${EXPLORER}/address/${d.contract}`} target="_blank" rel="noreferrer">{t.contract}</a></div>
        <h1 className="page-h1">{t.a}<span className="b">{t.b}</span></h1>
        <p className="lede">{fmt(t.lede, { fee })}</p>
        <ul className="teach-rules">{t.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </div>
      <BurnDesk contract={d.contract} token={d.token} fee={d.fee} feeText={fee} rpc={RPC_URL} explorer={EXPLORER} max={280}
        calls={{ approve: CALLS.approve, allowance: CALLS.allowance, balanceOf: CALLS.balanceOf, fn: CALLS.teach, event: CALLS.taught }} t={{ ...t.form, why: t.why }} />
      <section className="trail-sect" aria-labelledby="taught">
        <h2 id="taught">{t.taughtH}</h2>
        <p className="dim">{t.taughtNote}</p>
        {kept.length ? kept.map(row) : <p>{t.none}</p>}
      </section>
      <section className="trail-sect" aria-labelledby="all">
        <h2 id="all">{t.allH}</h2>
        {d.lessons.length ? d.lessons.map(row) : <p>{t.none}</p>}
      </section>
      <p style={{ padding: "40px 0 96px", borderTop: "1px solid var(--line)" }}><a className="more" href="/data/lessons.json">{t.raw}</a></p>
    </div>
  );
}
