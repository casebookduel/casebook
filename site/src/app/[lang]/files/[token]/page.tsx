import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FileCard, { ago, Notes, noteText, short, span } from "@/components/FileCard";
import HolderSign from "@/components/HolderSign";
import { fmt, hasLocale, lp, nf } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { clock, when } from "@/lib/duel";
import { EXPLORER } from "@/lib/explorer";
import { notesOf } from "@/lib/fileNotes";
import { FILES_DELAY, FILES_ON, getFile, isOpen, liveViewer, now as nowSec, openFor } from "@/lib/files";
import { HOLDER_MIN, HOLDER_ON } from "@/lib/holder";

// rendered per request on purpose: what a visitor sees depends on the holder cookie and the clock (files open after a delay)
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[lang]/files/[token]">): Promise<Metadata> {
  const { lang, token } = await params;
  if (!hasLocale(lang) || !FILES_ON) return {};
  const [t, f] = await Promise.all([getDictionary(lang).then((d) => d.files), getFile(token)]);
  if (!f) return { title: t.unknown };
  const name = f.symbol || short(f.token);
  // the description never tells more than the page does: a file not yet open says only that it opens
  const desc = isOpen(f) ? notesOf(f).slice(0, 3).map((x) => noteText(t, x.key, x.v)).join(" ") || t.lede : fmt(t.locked, { t: when(openFor(f)) });
  return { title: `${name} · ${t.file}`, description: desc };
}

export default async function FilePage({ params }: PageProps<"/[lang]/files/[token]">) {
  const { lang, token } = await params;
  if (!hasLocale(lang) || !FILES_ON) notFound();
  const [dict, f, holder] = await Promise.all([getDictionary(lang), getFile(token), liveViewer()]);
  const t = dict.files, n = nf(lang), now = nowSec(), all = lp(lang, "/files");
  const top = (title: React.ReactNode, b?: React.ReactNode) => (
    <div className="page-top">
      <div className="shead-bar"><span className="mlabel">{t.file}</span><Link className="mlabel" href={all}>{t.all} →</Link></div>
      <h1 className="page-h1">{title}{b && <span className="b">{b}</span>}</h1>
    </div>
  );
  if (!f) return <div className="wrap">{top(t.unknown)}<p className="lede">{t.unknownLede}</p><div style={{ height: 96 }} /></div>;
  if (!isOpen(f) && !holder) {
    return (
      <div className="wrap">
        {top(<span className="mono">{short(f.token)}</span>)}
        <p className="lede">{fmt(t.locked, { t: clock(openFor(f)) })} {t.lockedHolder}</p>
        {HOLDER_ON && <HolderSign offer={fmt(t.offer, { min: n(HOLDER_MIN) })} min={HOLDER_MIN} t={dict.holder} />}
        <div style={{ height: 96 }} />
      </div>
    );
  }
  const c = f.creator_record;
  const recent = holder ? c.recent : c.recent.filter((r) => r.ts <= now - FILES_DELAY);   // a launch still closed to non-holders stays out of the list too
  return (
    <div className="wrap">
      {top(f.symbol || short(f.token), f.name && f.name !== f.symbol ? f.name : undefined)}
      <p className="lede">{fmt(t.launched, { t: when(f.ts), b: n(f.block) })} · <a href={`${EXPLORER}/token/${f.token}`} target="_blank" rel="noreferrer">{t.explorer} ↗</a></p>
      <div className="file-page">
        <section className="file-notes">
          <h2 className="mlabel">{t.notes}</h2>
          <Notes f={f} t={t} />
        </section>
        <FileCard f={f} t={t} now={now} />
      </div>
      <section className="file-recent">
        <div className="shead-bar"><span className="mlabel">{t.latest}</span><span className="mlabel mono">{short(f.creator)}</span></div>
        <ol className="file-recent-list">
          {recent.map((r) => (
            <li key={r.token} aria-current={r.token === f.token ? "true" : undefined}>
              <Link href={`${all}/${r.token}`} className="mono">{r.symbol || short(r.token)}</Link>
              <span className="dim">{ago(t, now - r.ts)}</span>
              <span className={r.dev_sell_s != null && r.dev_sell_s <= 300 ? "warn" : "dim"}>{t.devSold}: {r.dev_sell_s != null ? fmt(t.soldAt, { t: span(t, r.dev_sell_s) }) : t.notYet}</span>
              <span>{r.grad_ts != null ? <span className="fbadge good">{t.graduated}</span> : <span className="dim">{r.first_buyer ? short(r.first_buyer) : t.noBuyer}</span>}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="dim file-receipts">{fmt(t.receipts, { b: n(f.block) })} <a href={`${EXPLORER}/address/${f.creator}`} target="_blank" rel="noreferrer">{t.dev} ↗</a> · <a href={`${EXPLORER}/address/${f.curve}`} target="_blank" rel="noreferrer">{dict.kinds.curve} ↗</a></p>
      <div style={{ height: 96 }} />
    </div>
  );
}
