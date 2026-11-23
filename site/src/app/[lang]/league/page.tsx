import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BurnDesk from "@/components/BurnDesk";
import { fmt, hasLocale, lp } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { EXPLORER } from "@/lib/explorer";
import { getLeague, LEAGUE_CALLS, LEAGUE_HOURS, LEAGUE_MAX, LEAGUE_ON } from "@/lib/league";
import { RPC_URL } from "@/lib/seal";

// no title until it opens: a closed page must not name the feature
export async function generateMetadata(): Promise<Metadata> {
  return LEAGUE_ON ? { title: "The notebook league" } : {};
}

const N = new Intl.NumberFormat("en-US");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (a: number, n: number) => `${Math.round((100 * a) / Math.max(1, n))}%`;

export default async function League({ params }: PageProps<"/[lang]/league">) {
  const { lang } = await params;
  if (!hasLocale(lang) || !LEAGUE_ON) notFound();
  const [d, dict] = await Promise.all([getLeague(), getDictionary(lang)]);
  const t = dict.league, fee = N.format(Number(d.feeText));
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{t.kicker}</span><a className="mlabel" href={`${EXPLORER}/address/${d.contract}`} target="_blank" rel="noreferrer">{t.contract}</a></div>
        <h1 className="page-h1">{t.a}<span className="b">{t.b}</span></h1>
        <p className="lede">{fmt(t.lede, { fee })}</p>
        <ul className="teach-rules">{t.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </div>
      <BurnDesk contract={d.contract} token={d.token} fee={d.fee} feeText={fee} rpc={RPC_URL} explorer={EXPLORER} calls={LEAGUE_CALLS}
        max={LEAGUE_MAX} lines rows={10} t={{ ...t.form, why: t.why }} />
      <section className="trail-sect" aria-labelledby="board">
        <h2 id="board">{t.boardH}</h2>
        <p className="dim">{t.boardNote}</p>
        {d.entries.length ? (
          <ol className="board">
            {d.entries.map((e, i) => (
              <li key={e.id} id={`e${e.id}`} className={`board-row ${e.status}`}>
                <span className="board-rank">{e.n ? i + 1 : "–"}</span>
                <div className="board-main">
                  <p><b>#{e.id}</b> <span className={`lesson-st ${e.status}`}>{t.status[e.status]}</span> <span className="dim">{fmt(t.by, { a: short(e.player) })}</span></p>
                  {e.n > 0 && (
                    <p className="board-score">
                      <b>{pct(e.right, e.n)}</b> {fmt(t.score, { r: e.right, n: e.n })} · {fmt(t.vs, { h: pct(e.holmes, e.n), m: pct(e.moriarty, e.n) })} · <Link href={lp(lang, `/hours/${e.hours[e.hours.length - 1]}`)}>{fmt(t.progress, { k: e.hours.length, of: LEAGUE_HOURS })}</Link>
                    </p>
                  )}
                  {e.status === "filtered"
                    ? <p className="dim">{fmt(t.hidden, { why: ((t.why as Record<string, string>)[e.why ?? ""] ?? e.why ?? "").replace(/[.。]$/, "") })}</p>
                    : <details><summary>{t.read}</summary><pre className="mono notes-pre">{e.text}</pre></details>}
                  {e.tx && <p className="meta"><a href={`${EXPLORER}/tx/${e.tx}`} target="_blank" rel="noreferrer">{t.tx}</a></p>}
                </div>
              </li>
            ))}
          </ol>
        ) : <p>{t.none}</p>}
      </section>
      <p style={{ padding: "40px 0 96px", borderTop: "1px solid var(--line)" }}><a className="more" href="/data/league.json">{t.raw}</a></p>
    </div>
  );
}
