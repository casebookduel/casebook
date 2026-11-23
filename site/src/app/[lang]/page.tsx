import Link from "next/link";
import { notFound } from "next/navigation";
import CopyCa from "@/components/CopyCa";
import DuelScene from "@/components/HeroScene";
import { Arrow } from "@/components/Icons";
import NotebookTabs from "@/components/NotebookTabs";
import Pixel from "@/components/Pixel";
import { OPEN } from "@/lib/open";
import { getLessons, TEACH_ON } from "@/lib/lessons";
import LessonRow from "@/components/LessonRow";
import { LEAGUE_ON } from "@/lib/league";
import Plates from "@/components/Plates";
import RecordPanel from "@/components/RecordPanel";
import Rise from "@/components/Rise";
import Terminal from "@/components/Terminal";
import Ticket from "@/components/Ticket";
import { fmt, hasLocale, HTML_LANG, lp, nf, pf } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { clock, diffLines, EXPLORER, getDuel, lite, MODEL_LINE, REFLECT_RULE, RPC_METHODS, when } from "@/lib/duel";
import { pText } from "@/lib/facts";
import { CASES_LIVE } from "@/lib/cases";
import { SEAL_CONTRACT } from "@/lib/seal";
import { ENGINE_LIVE, TOKEN_CA } from "@/lib/site";
import NotOurs from "@/components/NotOurs";

const FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
// English names inside translated copy keep English casing: lang="en" stops a Turkish uppercase dotting their i
const names = (s: string) => s.split(/(Robinhood Chain|Holmes|Moriarty)/).map((p, i) => (i % 2 ? <span key={i} lang="en">{p}</span> : p));

// Every section opens the same way: a hairline with its label and place, then a two-sentence headline whose second
// sentence steps back, then one line of context. The working panel under it carries the proof.
// The files beyond the duel, open ones first. Listed here once built; a card links to its page once it is open.
const NEXT: { id: string; icon: string; path?: string; on?: boolean }[] = [
  { id: "trail", icon: "trail", path: "/trail", on: OPEN.has("trail") }, { id: "teach", icon: "flame", path: "/teach", on: TEACH_ON },
  { id: "skill", icon: "note", path: "/install#notebook", on: ENGINE_LIVE && OPEN.has("skill") }, { id: "league", icon: "podium", path: "/league", on: LEAGUE_ON },
];

function Head({ n, of, kicker, a, b, lede, id }: { n: number; of: number; kicker: string; a: string; b: string; lede?: string; id: string }) {
  return (
    <Rise className="shead">
      <div className="shead-bar"><span className="mlabel">{kicker}</span><span className="mlabel">{String(n).padStart(2, "0")} / {String(of).padStart(2, "0")}</span></div>
      <div className="shead-main">
        <h2 id={id}><span className="mask"><span className="ln">{a}</span></span><span className="mask"><span className="ln b">{b}</span></span></h2>
        {lede && <p className="lede rv">{lede}</p>}
      </div>
    </Rise>
  );
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [duel, t, les] = await Promise.all([getDuel(), getDictionary(lang), TEACH_ON ? getLessons() : null]);
  const L = (p: string) => lp(lang, p), N = nf(lang), P = pf(lang);
  // the kind labels follow the page's language; questions and answers stay as the agents saw them
  const hours = lite(duel).map((h) => ({ ...h, rows: h.rows.map((r) => ({ ...r, label: t.kinds[r.kind as keyof typeof t.kinds] ?? r.label })) }));
  const last = hours.at(-1), s = duel.since;
  const notes = duel.notes.at(-1), prevNotes = duel.notes.at(-2), full = duel.hours.at(-1);
  const change = notes ? diffLines(prevNotes?.text ?? "", notes.text) : [];
  const chars = N(notes ? notes.text.length : 0);
  const allS = {
    hours: hours.length, holmes: hours.reduce((a, h) => a + h.holmes, 0), moriarty: hours.reduce((a, h) => a + h.moriarty, 0), n: hours.reduce((a, h) => a + h.n, 0),
    ahead: hours.filter((h) => h.holmes > h.moriarty).length, tied: hours.filter((h) => h.holmes === h.moriarty).length, behind: hours.filter((h) => h.holmes < h.moriarty).length,
    missed: duel.missed.length,
  };
  const m = t.method, lv = duel.levels;
  // questions in the latest hour and the call budget per question at the current level (m1/duel.py LEVELS)
  const q = last?.n ?? 6, c = [8, 12, 16][(lv?.current ?? 1) - 1] ?? 8;
  // the record panel carries the questions of the last 48 hours (older hours open their own page), so the page
  // stays the same size however long the record runs; the per-kind totals still count every hour
  const RECENT = 48;
  const panelHours = hours.map((h, i) => (i >= hours.length - RECENT ? h : { ...h, rows: [] }));
  const kindTotals = Object.values(hours.flatMap((x) => x.rows).reduce<Record<string, { label: string; h: number; m: number; n: number }>>((a, r) => {
    const k = (a[r.kind] ??= { label: r.label, h: 0, m: 0, n: 0 }); k.h += +r.h.ok; k.m += +r.m.ok; k.n += 1; return a;
  }, {}));
  const lvName = (n: number) => [t.levels.n1, t.levels.n2, t.levels.n3][n - 1] ?? "";
  // the bar shows how far the unlock rule is met: both its halves (90% right, 12 hours played), so it fills by the
  // one that is further from done
  const lvl = lv ? { badge: `${fmt(t.levels.badge, { n: lv.current })} · ${lvName(lv.current)}`, next: lv.current < 3 ? fmt(t.levels.next, { t: P(0.9) }) : t.levels.top, now: fmt(t.levels.now, { p: P(lv.pct / 100), h: lv.hours }), pct: lv.current < 3 ? Math.min(100, (100 * lv.pct) / 90, (100 * lv.hours) / 12) : null } : undefined;
  const steps5 = last && full ? [
    { icon: "chain", k: m.k1, t: fmt(m.t1, { q }), d: fmt(m.d1, { b: N(full.head) }) },
    { icon: "key", k: m.k2, t: m.t2, d: fmt(m.d2, { n: last.n }) },
    { icon: "agents", k: m.k3, t: m.t3, d: fmt(m.d3, { h: Math.round(full.holmesCalls * last.n), m: Math.round(full.moriartyCalls * last.n), c }) },
    { icon: "check", k: m.k4, t: m.t4, d: fmt(m.d4, { h: last.holmes, m: last.moriarty, n: last.n }) },
    { icon: "note", k: m.k5, t: m.t5, d: notes ? fmt(m.d5, { h: notes.hour, a: change.filter((c) => c.k === "add").length, d: change.filter((c) => c.k === "del").length, c: chars }) : "" },
  ] : [];
  // Teach Holmes leads the page while it is open: the latest hour's score, everything burned so far, every lesson.
  // `o` shifts the numbers of the sections after it.
  const tt = t.teach, o = les ? 1 : 0;
  const teach = les && {
    a: last ? fmt(tt.home.a, { a: last.holmes, n: last.n, h: last.hour }) : tt.a,
    b: last ? (last.holmes < last.n ? tt.home.b : tt.home.bAll) : tt.b,
    fee: N(Number(les.feeText)), kept: les.lessons.filter((l) => l.status === "kept").length,
    share: les.supply ? new Intl.NumberFormat(HTML_LANG[lang], { style: "percent", maximumFractionDigits: 2 }).format(les.burned / les.supply) : "",
  };
  const steps = last ? [
    { cmd: "curl -s {origin}/data/duel.json | jq '.since'", out: JSON.stringify(s, null, 2) },
    { cmd: "curl -s {origin}/data/duel.json | jq -c '.hours[-1].tasks[] | [.kind, .holmes.ok, .moriarty.ok]'", out: last.rows.map((r) => JSON.stringify([r.kind, r.h.ok, r.m.ok])).join("\n") },
  ] : [];

  return (
    <>
      <div className="hero-wrap">
        <section className="hero" aria-label="Casebook">
          <div className="stage">
            <DuelScene exchanges={last?.rows.map((r) => ({ h: r.h.ok, m: r.m.ok }))} />
            {last && <Plates t={t.plates} lines={{
              h: fmt(t.plates.holmesLine, { h: last.hour, a: last.holmes, n: last.n, c: chars }),
              m: fmt(t.plates.moriartyLine, { h: last.hour, a: last.moriarty, n: last.n, p: last.hour - 1 }),
            }} />}
          </div>
          <div className="hero-fade" />
          <div className="hero-copy">
            <div className="wrap">
              <div className="intro">
                {last && <p className="m-score"><span className="mlabel">{fmt(t.hero.hour, { h: last.hour })}</span><span className="holmes">Holmes {last.holmes}/{last.n}</span><span className="moriarty">Moriarty {last.moriarty}/{last.n}</span></p>}
                {TOKEN_CA && <CopyCa ca={TOKEN_CA} label="$CASE" where="ca-top" />}
                <p className="pill"><i aria-hidden="true" />{names(t.hero.pill)}<span className="pill-opt">{fmt(t.hero.pillMore, { q })}</span></p>
                <h1><span className="holmes">{t.hero.h1a}</span><span className="moriarty">{t.hero.h1b}</span></h1>
                <p className="lede">{t.hero.lede}</p>
                <div className="cta">
                  {les && <Link className="btn btn-solid" href={L("/teach")}>{tt.kicker} <Arrow /></Link>}
                  {last && <Link className={`btn ${les ? "btn-line" : "btn-solid"}`} href={L(`/hours/${last.hour}`)}>{fmt(t.hero.open, { h: last.hour })} <Arrow /></Link>}
                  {!les && (CASES_LIVE ? <Link className="btn btn-line" href={L("/case")}>{t.case.a.replace(/[.。]$/, "")}</Link> : <Link className="btn btn-line" href={L("/how")}>{t.hero.how}</Link>)}
                </div>
                {TOKEN_CA && <CopyCa ca={TOKEN_CA} label="$CASE" where="ca-end" />}
              </div>
              {last && <Ticket h={last} time={clock(last.ts)} t={t.ticket} href={L(`/hours/${last.hour}`)} lvl={lvl} />}
            </div>
          </div>
        </section>

        <section className="hstrip" aria-label={t.strip.label}>
          <div className="hstrip-row">
            {[...hours].reverse().map((h) => (
              <Link key={h.hour} prefetch={false} className={`hchip ${h.rule}`} href={L(`/hours/${h.hour}`)} aria-label={`${fmt(t.strip.hour, { h: h.hour })}: Holmes ${h.holmes}, Moriarty ${h.moriarty}`}>
                <span className="mlabel">{fmt(t.strip.hour, { h: h.hour })}{lv && <span className="lv-tag">{fmt(t.levels.tag, { n: h.level })}</span>}</span>
                <span className="hchip-bars" aria-hidden="true"><i className="h" style={{ height: `${(100 * h.holmes) / h.n}%` }} /><i className="m" style={{ height: `${(100 * h.moriarty) / h.n}%` }} /></span>
                <span className="hchip-s"><span className="holmes">{h.holmes}</span><span className="dim">–</span><span className="moriarty">{h.moriarty}</span></span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {les && teach && (
        <section className="sect band-2" aria-labelledby="teach">
          <div className="wrap">
            <Head id="teach" n={1} of={6} kicker={tt.kicker} a={teach.a} b={teach.b} lede={fmt(tt.lede, { fee: teach.fee })} />
            <Rise className="panel">
              <ol className="teach3">
                <li className="rv">
                  <span className="mlabel">{tt.home.burned}</span><strong className="num">{N(les.burned)}</strong>
                  <p><a className="proof" href={`${EXPLORER}/token/${les.token}?tab=holders`} target="_blank" rel="noreferrer">{fmt(tt.home.burnedNote, { p: teach.share })}</a></p>
                </li>
                <li className="rv">
                  <span className="mlabel">{tt.home.lessons}</span><strong className="num">{N(les.lessons.length)}</strong>
                  <p>{fmt(tt.home.lessonsNote, { k: teach.kept })}</p>
                </li>
                <li className="rv">
                  <span className="mlabel">{tt.home.fee}</span><strong className="num">{teach.fee} <small>$CASE</small></strong>
                  <p>{tt.home.feeNote}</p>
                </li>
              </ol>
              <div className="teach-go rv">
                <Link className="btn btn-solid" href={L("/teach")}>{tt.kicker} <Arrow /></Link>
                <a className="proof" href={`${EXPLORER}/address/${les.contract}`} target="_blank" rel="noreferrer">{tt.contract}</a>
              </div>
            </Rise>
            {les.lessons.length > 0 && (
              <Rise className="teach-board">
                <div className="rv">{les.lessons.slice(0, 3).map((l) => <LessonRow key={l.id} l={l} t={tt} L={L} />)}</div>
                <p className="rv"><Link className="more" href={L("/teach") + "#all"}>{tt.home.every} <Arrow size={15} /></Link></p>
              </Rise>
            )}
          </div>
        </section>
      )}

      <section className="sect" aria-labelledby="record">
        <div className="wrap">
          <Head id="record" n={1 + o} of={5 + o} kicker={t.record.kicker} a={t.record.a} b={t.record.b} lede={fmt(t.record.lede, { k: duel.ruleV2From })} />
          <Rise><div className="rv"><RecordPanel lang={lang} t={t.record} levelTag={lv ? t.levels.tag : undefined} hours={panelHours} kinds={kindTotals} all={allS} stats={{ from: duel.ruleV2From, holmes: s.holmes, moriarty: s.moriarty, n: s.n, ahead: s.ahead, of: s.hours, p: duel.pairs.p }} /></div></Rise>
          <p className="note">{fmt(t.record.note, { k: duel.ruleV2From })}</p>
        </div>
      </section>

      <section className="sect band-2" aria-labelledby="memory">
        <div className="wrap">
          <Head id="memory" n={2 + o} of={5 + o} kicker={t.memory.kicker} a={t.memory.a} b={t.memory.b} lede={t.memory.lede} />
          {notes && <Rise><div className="rv"><NotebookTabs t={t.memory} hour={notes.hour} text={notes.text} diff={change} /></div></Rise>}
        </div>
      </section>

      <section className="sect" aria-labelledby="method">
        <div className="wrap">
          <Head id="method" n={3 + o} of={5 + o} kicker={m.kicker} a={m.a} b={m.b} lede={last ? fmt(m.lede, { h: last.hour }) : undefined} />
          <Rise className="panel steps-panel">
            <ol className="steps5">
              {steps5.map((st, i) => (
                <li className="rv" key={st.icon}>
                  <Pixel name={st.icon} />
                  <span className="mlabel">{String(i + 1).padStart(2, "0")} · {st.k}</span>
                  <h3>{st.t}</h3>
                  <p>{st.d}</p>
                </li>
              ))}
            </ol>
            <div className="steps-proof">
              {last && <Link className="proof" href={L(`/hours/${last.hour}`)}>{fmt(m.proofQuestions, { h: last.hour })}</Link>}
              <a className="proof" href={`${EXPLORER}/address/${FACTORY}`} target="_blank" rel="noreferrer">{m.proofFactory}</a>
              <Link className="proof" href={L("/how") + "#prompt"}>{m.proofPrompt}</Link>
              <Link className="proof" href={L("/how") + "#grading"}>{m.proofGrading}</Link>
              {SEAL_CONTRACT && last && <Link className="proof" href={L(`/hours/${last.hour}`)}>{fmt(m.proofSeal, { h: last.hour })}</Link>}
            </div>
          </Rise>
        </div>
      </section>

      <section className="sect band-2" aria-labelledby="build">
        <div className="wrap">
          <Head id="build" n={4 + o} of={5 + o} kicker={t.build.kicker} a={t.build.a} b={t.build.b} lede={t.build.lede} />
          <Rise className="dev">
            <div className="rv">{steps.length > 0 && <Terminal steps={steps} title={t.build.terminal} />}</div>
            <div className="rv">
              <dl className="harness">
                <div><dt className="mlabel">{t.build.model}</dt><dd className="mono">{MODEL_LINE}</dd></div>
                <div><dt className="mlabel">{t.build.tools}</dt><dd className="mono">rpc, keccak, words, answer</dd></div>
                <div><dt className="mlabel">{t.build.rpc}</dt><dd className="mono">{RPC_METHODS.join(", ")}</dd></div>
                <div><dt className="mlabel">{t.build.budget}</dt><dd>{lv ? t.build.budgetL : t.build.budgetV}</dd></div>
                <div><dt className="mlabel">{t.build.memory}</dt><dd>{t.build.memoryV}</dd></div>
                <div><dt className="mlabel">{t.build.data}</dt><dd><a href="/data/results.jsonl">results.jsonl</a> · <a href="/data/duel.json">duel.json</a>{last ? ` · ${fmt(t.build.lastRow, { t: when(last.ts) })}` : ""}</dd></div>
              </dl>
              <details className="rule">
                <summary className="mlabel">{t.build.rule}</summary>
                <pre className="mono">{REFLECT_RULE}</pre>
              </details>
              {ENGINE_LIVE && <p className="engine-link"><Link className="more" href={L("/install")}>{t.build.engine} <Arrow size={15} /></Link></p>}
            </div>
          </Rise>
        </div>
      </section>

      <section className="sect" aria-labelledby="next">
        <div className="wrap">
          <Head id="next" n={5 + o} of={5 + o} kicker={t.next.kicker} a={t.next.a} b={t.next.b} lede={t.next.lede} />
          <Rise className="panel">
            <ol className="next4">
              {NEXT.map((x, i) => ({ ...x, i, href: x.on ? x.path : undefined })).sort((a, b) => Number(!!b.href) - Number(!!a.href)).map((x, k) => (
                <li className="rv" key={x.id}>
                  <Pixel name={x.icon} />
                  <span className="mlabel">{String(k + 1).padStart(2, "0")} · {x.href ? t.next.live : t.next.soon}</span>
                  <h3>{t.next.items[x.i].t}</h3>
                  <p>{t.next.items[x.i].d}</p>
                  {x.href && <Link className="more" href={L(x.href)}>{t.next.open} <Arrow size={15} /></Link>}
                </li>
              ))}
            </ol>
          </Rise>
        </div>
      </section>

      <section className="sect faq" aria-labelledby="faq">
        <div className="wrap faq-grid">
          <Rise className="faq-head">
            <h2 id="faq"><span className="mask"><span className="ln">{t.faq.title}</span></span></h2>
            <p className="dim rv">{t.faq.subA} <Link href={L("/how")}>{t.faq.how}</Link>{t.faq.subB} <a href="/data/results.jsonl">{t.faq.raw}</a>{t.faq.subC}</p>
          </Rise>
          <div className="faq-list">
            {t.faq.items.map(({ q, a }, i) => (
              <details key={q} className="qa"><summary>{q}</summary><p>{fmt(i === 0 && TOKEN_CA ? t.faq.live : a, { k: duel.ruleV2From, p: pText(duel.pairs.p), model: MODEL_LINE, ca: TOKEN_CA, q, c })}</p>{i === 0 && <NotOurs text={t.footer.notOurs} />}</details>
            ))}
          </div>
        </div>
      </section>

      {last && (
        <section className="close" aria-label={fmt(t.close.a, { h: last.hour })}>
          <div className="wrap">
            <Rise className="close-in">
              <h2><span className="mask"><span className="ln">{fmt(t.close.a, { h: last.hour })}</span></span><span className="mask"><span className="ln b">{t.close.b}</span></span></h2>
              <div className="cta rv">
                <Link className="btn btn-solid" href={L(`/hours/${last.hour}`)}>{fmt(t.hero.open, { h: last.hour })} <Arrow /></Link>
                <Link className="btn btn-line" href={L("/hours")}>{t.close.every}</Link>
              </div>
            </Rise>
          </div>
        </section>
      )}
    </>
  );
}
