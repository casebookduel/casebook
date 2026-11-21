import crypto from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Check, Cross } from "@/components/Icons";
import Linked from "@/components/Linked";
import { fmt, hasLocale, lp } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { caseLines, CASES_LIVE, getCase, type CaseArm } from "@/lib/cases";
import { EXPLORER, short, when } from "@/lib/duel";

// Cache Components needs one param at build time; any other id renders on its first visit.
export function generateStaticParams() {
  const ids = caseLines().slice(-20).map((c) => c.id);
  return (ids.length ? ids : ["0"]).map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/case/[id]">): Promise<Metadata> {
  const { lang, id } = await params;
  if (!hasLocale(lang)) return {};
  return { title: fmt((await getDictionary(lang)).case.pageKicker, { id }), robots: { index: false } };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

function Arm({ who, a, t, budget }: { who: "Holmes" | "Moriarty"; a: CaseArm; t: Record<string, string>; budget: number }) {
  return (
    <section className={`arm ${who === "Holmes" ? "h" : "m"}`} aria-label={who}>
      <header>
        <b className={who === "Holmes" ? "holmes" : "moriarty"}>{who}</b>
        <span className="dim" style={{ fontSize: "0.88rem" }}>{fmt(t.calls, { n: a.calls, m: budget })}</span>
      </header>
      <div className={`final ${a.ok ? "ok" : "no"}`}>
        {a.ok ? <Check /> : <Cross />}
        <span>{a.answer ? <span className="mono">{clip(a.answer, 120)}</span> : t.noAnswer}<span className="dim" style={{ display: "block", fontSize: "0.85rem" }}>{a.ok ? t.right : t.wrong}</span></span>
      </div>
      <ol className="steps">
        {a.trace.map((s, i) => (
          <li key={i}>
            <div className="call mono">{s.tool === "rpc" && s.args?.method != null ? <><b>rpc</b> {String(s.args.method)}({clip(JSON.stringify(s.args.params ?? []), 320)})</> : <><b>{s.tool}</b>({clip(JSON.stringify(s.args ?? {}), 200)})</>}</div>
            <div className="out mono">{s.out}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function CaseView({ params }: PageProps<"/[lang]/case/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang) || !CASES_LIVE) notFound();
  const [dict, c] = await Promise.all([getDictionary(lang), getCase(id)]);
  if (!c) notFound();
  const t = dict.case, tk = dict.ticket;
  const verdict = c.holmes.ok && c.moriarty.ok ? t.both : !c.holmes.ok && !c.moriarty.ok ? t.neither
    : `${fmt(c.holmes.ok ? tk.right : tk.wrong, { who: "Holmes" })}, ${fmt(c.moriarty.ok ? tk.right : tk.wrong, { who: "Moriarty" })}.`;
  // the key and salt were printed after both answers; check here that they hash to what was shown before either started
  const sealed = crypto.createHash("sha256").update(`${c.truth}|${c.salt}`).digest("hex") === c.commit;
  const label = dict.kinds[c.kind as keyof typeof dict.kinds] ?? c.kind;
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{fmt(t.pageKicker, { id: c.id })}</span><span className="mlabel">{fmt(t.asked, { t: when(c.ts) })}</span></div>
        <h1 className="page-h1">{fmt(t.pageA, { k: label, t: short(c.token) })}<span className="b">{verdict}</span></h1>
        <div className="hour-meta">
          <span>{t.tokenL} <a className="addr mono" href={`${EXPLORER}/token/${c.token}`} target="_blank" rel="noreferrer">{c.token}</a></span>
          <span className="mono">{c.model}</span>
          <span>{fmt(t.notesChars, { c: c.notes.chars.toLocaleString("en-US") })}</span>
        </div>
      </div>
      <article className="task" aria-labelledby="q">
        <div className="task-q">
          <div>
            <span className="label">{label}</span>
            <p className="q" id="q"><Linked text={c.q} /></p>
          </div>
          <div className="src">
            <span className="label">{t.key}</span>
            <b className="mono">{/^0x[0-9a-f]{40}$/i.test(c.truth) ? <Linked text={c.truth} full /> : c.truth}</b>
            {sealed && <span className="commit ok">{fmt(t.keyCheck, { a: c.truth, s: c.salt })}</span>}
            {c.checked && <span className="commit ok">{t.checked}</span>}
            <span className="commit">SHA-256 {c.commit}</span>
          </div>
        </div>
        <div className="duo">
          <Arm who="Holmes" a={c.holmes} t={t} budget={c.calls} />
          <Arm who="Moriarty" a={c.moriarty} t={t} budget={c.calls} />
        </div>
      </article>
      <nav className="pager" aria-label="Cases">
        <Link className="more" href={lp(lang, "/case")}><Back size={16} /> {t.again}</Link>
        <span />
        <span />
      </nav>
      <div style={{ height: 96 }} />
    </div>
  );
}
