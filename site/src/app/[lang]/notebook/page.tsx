import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Icons";
import { notFound } from "next/navigation";
import { fmt, hasLocale, lp } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { diffLines, getDuel } from "@/lib/duel";

export async function generateMetadata({ params }: PageProps<"/[lang]/notebook">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: (await getDictionary(lang)).notebook.a.replace(/[.。]$/, "") };
}

export default async function Notebook({ params }: PageProps<"/[lang]/notebook">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [duel, dict] = await Promise.all([getDuel(), getDictionary(lang)]);
  const t = dict.notebook, L = (q: string) => lp(lang, q);
  const versions = duel.notes.map((n, i) => ({ ...n, prev: i ? duel.notes[i - 1].text : "", prevHour: i ? duel.notes[i - 1].hour : 0 })).reverse();
  const score = (hour: number) => duel.hours.find((h) => h.hour === hour);
  // a run of versions that changed nothing folds into one short row; the newest and the first version stay whole
  type V = (typeof versions)[number] & { idx: number; rows: ReturnType<typeof diffLines> };
  const blocks: (V | V[])[] = [];
  versions.forEach((x, idx) => {
    const v = { ...x, idx, rows: diffLines(x.prev, x.text) }, last = blocks.at(-1);
    if (!idx || !v.prev || v.rows.some((r) => r.k !== "same")) blocks.push(v);
    else if (Array.isArray(last)) last.push(v);
    else blocks.push([v]);
  });
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{t.kicker}</span><span className="mlabel">{fmt(t.count, { n: duel.notes.length })}</span></div>
        <h1 className="page-h1">{t.a}<span className="b">{t.b}</span></h1>
        <p className="lede">{t.lede}</p>
      </div>
      {blocks.map((b) => {
        if (Array.isArray(b)) {
          const hi = b[0], lo = b[b.length - 1];
          return (
            <section className="version same" key={hi.hour} aria-labelledby={`v${hi.hour}`}>
              <h2 id={`v${hi.hour}`}>{lo === hi ? fmt(t.after, { h: hi.hour }) : fmt(t.afterRange, { a: lo.hour, b: hi.hour })}</h2>
              <p className="meta">{fmt(t.unchanged, { p: lo.prevHour })}</p>
            </section>
          );
        }
        const v = b, { idx, rows } = b, used = score(v.hour + 1), made = score(v.hour);
        const changed = rows.filter((r) => r.k !== "same"), adds = changed.filter((r) => r.k === "add").length, dels = changed.length - adds;
        const list = (rs: typeof rows) => (
          <ul className="diff mono" aria-label={fmt(dict.memory.tabD, { h: v.hour })}>
            {rs.map((r, i) => <li key={i} className={r.k}>{r.k === "add" ? <span className="sr">added: </span> : r.k === "del" ? <span className="sr">dropped: </span> : null}{r.l}</li>)}
          </ul>
        );
        return (
          <section className="version" key={v.hour} aria-labelledby={`v${v.hour}`}>
            <div>
              <h2 id={`v${v.hour}`}>{fmt(t.after, { h: v.hour })}</h2>
              <p className="meta">
                {made && <>{fmt(t.written, { h: v.hour, a: made.holmes, n: made.n })}<br /></>}
                {used ? <Link prefetch={false} href={L(`/hours/${used.hour}`)}>{fmt(t.readIn, { h: used.hour, a: used.holmes, n: used.n, m: used.moriarty })}</Link> : fmt(t.notRead, { h: v.hour + 1 })}
              </p>
              <p className="meta">{changed.length ? fmt(t.lines, { a: adds, d: dels }) : fmt(t.unchanged, { p: v.prevHour })}</p>
            </div>
            <div>
              {/* the newest and the first version in full; older ones show what changed, the rest one click away */}
              {idx === 0 || !v.prev ? list(rows) : (
                <>
                  {list(changed)}
                  <details className="whole"><summary>{fmt(t.whole, { n: rows.length - changed.filter((r) => r.k === "del").length })}</summary>{list(rows.filter((r) => r.k !== "del"))}</details>
                </>
              )}
            </div>
          </section>
        );
      })}
      <p style={{ padding: "40px 0 96px", borderTop: "1px solid var(--line)" }}>
        <Link className="more" href={L("/how")}>{t.how} <Arrow size={16} /></Link>
      </p>
    </div>
  );
}
