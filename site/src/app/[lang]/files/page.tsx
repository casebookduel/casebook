import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { short } from "@/components/FileCard";
import FilesFeed from "@/components/FilesFeed";
import HolderSign from "@/components/HolderSign";
import { fmt, hasLocale, lp, nf } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { FILES_DELAY, FILES_ON, getFeed, getFileStats, liveViewer, now as nowSec } from "@/lib/files";
import { HOLDER_MIN, HOLDER_ON } from "@/lib/holder";

// rendered per request on purpose: what a visitor sees depends on the holder cookie and the clock (files open after a delay)
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[lang]/files">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = (await getDictionary(lang)).files;
  return { title: t.a.replace(/[.。]$/, ""), description: t.lede };
}

export default async function FilesPage({ params }: PageProps<"/[lang]/files">) {
  const { lang } = await params;
  if (!hasLocale(lang) || !FILES_ON) notFound();
  const [dict, holder] = await Promise.all([getDictionary(lang), liveViewer()]);
  const [files, stats] = await Promise.all([getFeed(!!holder), getFileStats()]);
  const t = dict.files, n = nf(lang), now = stats?.now ?? nowSec();
  const behind = stats ? stats.head - stats.last_block : 0;
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{t.kicker}</span><span className="mlabel">{t.sub}</span></div>
        <h1 className="page-h1">{t.a}<span className="b">{t.b}</span></h1>
        <p className="lede">{t.lede}</p>
      </div>
      <section className="files-top" aria-label={t.day}>
        {stats && (
          <dl className="files-day">
            <div><dt className="mlabel">{t.day}</dt><dd><b>{n(stats.launches_24h)}</b> {t.launches}</dd></div>
            <div><dt className="mlabel">&nbsp;</dt><dd><b>{n(stats.creators_24h)}</b> {t.devs}</dd></div>
            <div><dt className="mlabel">&nbsp;</dt><dd><b>{n(stats.repeat_creators_24h)}</b> {t.repeat}</dd></div>
            <div><dt className="mlabel">&nbsp;</dt><dd><b>{n(stats.top8_first_buys_24h)}/{n(stats.first_buys_24h)}</b> {t.top8}</dd></div>
          </dl>
        )}
        <div className="files-access">
          {holder ? <p className="holmes">{fmt(t.ok, { a: short(holder) })}</p> : (
            <>
              <p>{fmt(t.delayed, { m: Math.round(FILES_DELAY / 60) })}</p>
              {HOLDER_ON && <HolderSign offer={fmt(t.offer, { min: n(HOLDER_MIN) })} min={HOLDER_MIN} t={dict.holder} />}
            </>
          )}
          {behind > 2_000 && <p className="dim">{fmt(t.behind, { n: n(behind) })}</p>}
        </div>
      </section>
      {files ? <FilesFeed initial={files} now0={now} t={t} base={lp(lang, "/files")} /> : <p className="dim">{t.unreachable}</p>}
      <div style={{ height: 96 }} />
    </div>
  );
}
