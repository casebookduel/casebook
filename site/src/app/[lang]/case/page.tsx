import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CaseDesk from "@/components/CaseDesk";
import { Mark } from "@/components/Ticket";
import { fmt, hasLocale, lp } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { CASE_KINDS, CASES_LIVE, getCases } from "@/lib/cases";
import { EXPLORER, short, when } from "@/lib/duel";
import { HOLDER_CASES, HOLDER_MIN, HOLDER_ON } from "@/lib/holder";

export async function generateMetadata({ params }: PageProps<"/[lang]/case">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = (await getDictionary(lang)).case;
  return { title: t.a.replace(/[.。]$/, ""), description: t.lede };
}

export default async function CasePage({ params }: PageProps<"/[lang]/case">) {
  const { lang } = await params;
  if (!hasLocale(lang) || !CASES_LIVE) notFound();
  const [dict, cases] = await Promise.all([getDictionary(lang), getCases()]);
  const t = dict.case;
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{t.kicker}</span><span className="mlabel">{t.sub}</span></div>
        <h1 className="page-h1">{t.a}<span className="b">{t.b}</span></h1>
        <p className="lede">{t.lede}</p>
      </div>
      <CaseDesk kinds={[...CASE_KINDS]} labels={dict.kinds} t={t} caseHref={lp(lang, "/case")} explorer={EXPLORER} holder={HOLDER_ON ? { min: HOLDER_MIN, cases: HOLDER_CASES, t: dict.holder } : undefined} />
      <section className="case-board" aria-labelledby="board">
        <div className="shead-bar"><span className="mlabel" id="board">{t.tally}</span>{cases.recent.length > 0 && <span className="mlabel">{t.recent}</span>}</div>
        <div className="case-board-in">
          <div>
            {cases.n > 0 ? <p className="case-tally">{fmt(t.tallyLine, { h: cases.holmes, m: cases.moriarty, n: cases.n })}</p> : <p className="dim">{t.empty}</p>}
            <p className="dim">{t.tallyNote}</p>
          </div>
          {cases.recent.length > 0 && (
            <ol className="case-recent">
              {cases.recent.map((c) => (
                <li key={c.id}>
                  <Link href={lp(lang, `/case/${c.id}`)}>
                    <span className="label">{dict.kinds[c.kind as keyof typeof dict.kinds] ?? c.kind}</span>
                    <span className="mono">{short(c.token)}</span>
                    {/* the mark carries right or wrong for screen readers, so the name beside it is read once */}
                    <span className="holmes"><Mark ok={c.h} who={fmt(c.h ? dict.ticket.right : dict.ticket.wrong, { who: "Holmes" })} /><span aria-hidden="true">Holmes</span></span>
                    <span className="moriarty"><Mark ok={c.m} who={fmt(c.m ? dict.ticket.right : dict.ticket.wrong, { who: "Moriarty" })} /><span aria-hidden="true">Moriarty</span></span>
                    <span className="dim">{when(c.ts)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
      <div style={{ height: 96 }} />
    </div>
  );
}
