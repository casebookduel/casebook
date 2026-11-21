import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Icons";
import { notFound } from "next/navigation";
import { fmt, hasLocale, lp, nf } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { EXPLORER, getDuel, when } from "@/lib/duel";

export async function generateMetadata({ params }: PageProps<"/[lang]/hours">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: (await getDictionary(lang)).hours.a.replace(/[.。]$/, "") };
}

export default async function Hours({ params }: PageProps<"/[lang]/hours">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [duel, dict] = await Promise.all([getDuel(), getDictionary(lang)]);
  const t = dict.hours, L = (q: string) => lp(lang, q), N = nf(lang), D = nf(lang, 1);
  // newest first, with the missed hours in their places
  const rows = [...duel.hours.map((h) => ({ n: h.hour, h, m: null })), ...duel.missed.map((m) => ({ n: m.hour, h: null, m }))].sort((a, b) => b.n - a.n);
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{t.kicker}</span><span className="mlabel">{fmt(t.count, { n: duel.hours.length })}</span></div>
        <h1 className="page-h1">{t.a}<span className="b">{t.b}</span></h1>
        <p className="lede">{t.lede}</p>
      </div>
      <div className="scroll-x" style={{ paddingTop: 40 }}>
        <table className="hours-table">
          <thead>
            <tr>
              <th className="label">{t.hour}</th><th className="label">{t.graded}</th><th className="label opt-col">{t.head}</th>
              <th className="label holmes" lang="en">Holmes</th><th className="label moriarty" lang="en">Moriarty</th>
              <th className="label opt-col">{t.calls}</th><th className="label opt-col">{t.rule}</th><th className="opt-col"><span className="sr">{t.open}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ n, h, m }) => !h ? (
              <tr key={n} id={`h${n}`} className="missed">
                <td><span className="score dim">{t.hour} {n}</span></td>
                <td colSpan={7} className="dim"><span className="tag">{t.missed}</span> {m?.why}</td>
              </tr>
            ) : (
              <tr key={n}>
                <td><Link prefetch={false} className="score" href={L(`/hours/${h.hour}`)}>{t.hour} {h.hour}</Link></td>
                <td className="dim"><span className="nowrap">{when(h.ts).replace(/ \d\d:\d\d UTC$/, "")}</span> <span className="nowrap">{when(h.ts).replace(/^.* (?=\d\d:\d\d UTC$)/, "")}</span></td>
                <td className="opt-col"><a className="addr mono" href={`${EXPLORER}/block/${h.head}`} target="_blank" rel="noreferrer">{N(h.head)}</a></td>
                <td><span className="score holmes">{h.holmes}/{h.n}</span></td>
                <td><span className="score moriarty">{h.moriarty}/{h.n}</span></td>
                <td className="dim opt-col"><span className="holmes"><span aria-hidden="true">H </span><span className="sr">Holmes </span>{D(h.holmesCalls)}</span> · <span className="moriarty"><span aria-hidden="true">M </span><span className="sr">Moriarty </span>{D(h.moriartyCalls)}</span></td>
                <td className="opt-col"><span className="tag">{h.rule === "v1" ? t.ruleFirst : t.ruleReal}</span></td>
                <td className="opt-col"><Link prefetch={false} className="more" href={L(`/hours/${h.hour}`)} aria-label={`${t.open} ${h.hour}`}>{t.open} <Arrow size={16} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ height: 96 }} />
    </div>
  );
}
