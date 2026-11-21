import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Arrow, Back, Check, Cross } from "@/components/Icons";
import Linked from "@/components/Linked";
import SealCheck from "@/components/SealCheck";
import { fmt, hasLocale, lp, nf } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import type { Dict } from "@/i18n/en";
import { EXPLORER, getDuel, when, type Attempt, type Evidence, type Step } from "@/lib/duel";
import { getSeals, RPC_URL, SEAL_CONTRACT, sealsCall } from "@/lib/seal";

// The page is fully decided by the cached duel data, so a short blocking render is fine.
export const instant = false;

export async function generateStaticParams() {
  const duel = await getDuel();
  const hours = duel.hours.map((h) => ({ hour: String(h.hour) }));
  return hours.length ? hours : [{ hour: "0" }];   // Cache Components needs one; with no data yet it renders not-found
}

export async function generateMetadata({ params }: PageProps<"/[lang]/hours/[hour]">): Promise<Metadata> {
  const { hour, lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: fmt((await getDictionary(lang)).hour.a, { h: hour }).replace(/[.。]$/, "") };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

// a call that left out its main argument is shown exactly as it was made, e.g. rpc({}), never as "undefined"
function Call({ s }: { s: Step }) {
  const a = (s.args ?? {}) as Record<string, unknown>;
  if (s.tool === "rpc" && a.method != null) return <><b>rpc</b> {String(a.method)}({clip(JSON.stringify(a.params ?? []), 320)})</>;
  if (s.tool === "keccak" && a.text != null) return <><b>keccak</b>(&quot;{String(a.text)}&quot;)</>;
  if (s.tool === "words" && a.hex != null) return <><b>words</b>({clip(String(a.hex), 90)})</>;
  return <><b>{s.tool}</b>({clip(JSON.stringify(a), 200)})</>;
}

// one line per piece of evidence, linked to the explorer where a reader can see it
function Proof({ e }: { e: Evidence }) {
  if (e.tx) return <a className="addr mono" href={`${EXPLORER}/tx/${e.tx}`} target="_blank" rel="noreferrer">{e.what} · tx {e.tx.slice(0, 10)}…{e.logIndex !== undefined ? ` · log ${e.logIndex}` : ""}</a>;
  if (e.getLogs) return <a className="addr mono" href={`${EXPLORER}/address/${e.getLogs.address}?tab=logs`} target="_blank" rel="noreferrer">{e.what} · blocks {e.getLogs.fromBlock}–{e.getLogs.toBlock}{e.count !== undefined ? ` · ${e.count} log${e.count === 1 ? "" : "s"}` : ""}</a>;
  if (e.eth_call) return <a className="addr mono" href={`${EXPLORER}/address/${e.eth_call.to}`} target="_blank" rel="noreferrer">{e.what}{e.block ? ` · block ${e.block}` : ""}</a>;
  return <span className="mono">{e.what}</span>;
}

function Arm({ who, a, t }: { who: "Holmes" | "Moriarty"; a: Attempt; t: Dict["hour"] }) {
  return (
    <section className={`arm ${who === "Holmes" ? "h" : "m"}`} aria-label={who}>
      <header>
        <b className={who === "Holmes" ? "holmes" : "moriarty"}>{who}</b>
        <span className="dim" style={{ fontSize: "0.88rem" }}>{fmt(t.calls, { n: a.calls })}</span>
      </header>
      <div className={`final ${a.ok ? "ok" : "no"}`}>
        {a.ok ? <Check /> : <Cross />}
        <span>
          {a.answer ? <>{t.answered} <span className="mono">{a.answer}</span></> : t.noAnswer}
          <span className="dim" style={{ display: "block", fontSize: "0.85rem" }}>{a.ok ? t.match : t.noMatch}</span>
        </span>
      </div>
      <ol className="steps">
        {a.trace.map((s, i) => (
          <li key={i}>
            <div className="call mono"><Call s={s} /></div>
            <div className="out mono">{s.out}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function HourPage({ params }: PageProps<"/[lang]/hours/[hour]">) {
  const { hour, lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [duel, dict] = await Promise.all([getDuel(), getDictionary(lang)]);
  const t = dict.hour, L = (p: string) => lp(lang, p), N = nf(lang);
  const h = duel.hours.find((x) => String(x.hour) === hour);
  if (!h) notFound();
  const prev = duel.hours.find((x) => x.hour === h.hour - 1), next = duel.hours.find((x) => x.hour === h.hour + 1);
  const seal = SEAL_CONTRACT ? (await getSeals())[h.hour] : undefined;

  return (
    <div className="wrap">
        <div className="page-top">
          <div className="shead-bar"><span className="mlabel">{fmt(t.kicker, { h: h.hour })}</span><span className="mlabel">{fmt(t.graded, { t: when(h.ts) })}</span></div>
          <div className="row">
            <h1 className="page-h1">{fmt(t.a, { h: h.hour })}<span className="b">{h.holmes === h.moriarty ? t.level : h.holmes > h.moriarty ? t.holmesAhead : t.moriartyAhead}</span></h1>
            <div className="hour-score">
              <div><span className="label holmes" lang="en">Holmes</span><b className="holmes">{h.holmes}/{h.n}</b></div>
              <div><span className="label moriarty" lang="en">Moriarty</span><b className="moriarty">{h.moriarty}/{h.n}</b></div>
            </div>
          </div>
          <div className="hour-meta">
            <span>{t.drawn} <a className="addr mono" href={`${EXPLORER}/block/${h.head}`} target="_blank" rel="noreferrer">{N(h.head)}</a></span>
            <span className="mono">{h.model}</span>
            <span>{h.rule === "v1" ? t.ruleFirst : t.ruleReal}</span>
            {duel.levels && <span>{fmt(dict.levels.badge, { n: h.level })} · {[dict.levels.n1, dict.levels.n2, dict.levels.n3][h.level - 1]}</span>}
            {h.taught.length > 0 && <span>{t.taught} <Link href={L("/teach")}>{h.taught.map((id) => `#${id}`).join(" ")}</Link></span>}
          </div>
          {SEAL_CONTRACT && (
            <div className="seal-row">
              <span className="mlabel">{t.seal.label}</span>
              {seal?.tx
                ? <a className="addr mono" href={`${EXPLORER}/tx/${seal.tx}`} target="_blank" rel="noreferrer">{t.seal.sealed} · tx {seal.tx.slice(0, 10)}…</a>
                : seal ? <a className="addr mono" href={`${EXPLORER}/address/${SEAL_CONTRACT}`} target="_blank" rel="noreferrer">{t.seal.sealed}</a>
                : <span className="dim">{t.seal.pending}</span>}
              <SealCheck hour={h.hour} contract={SEAL_CONTRACT} data={sealsCall(h.hour)} rpc={RPC_URL} t={t.seal} />
              <Link className="more" href={L("/how") + "#seals"}>{t.seal.how}</Link>
            </div>
          )}
        </div>

      <details className="used" style={{ marginTop: 40 }}>
        <summary>{h.notesUsed ? fmt(t.notesUsed, { p: h.hour - 1 }) : t.noNotes}</summary>
        {h.notesUsed ? <pre className="block mono">{h.notesUsed}</pre> : <p className="dim" style={{ paddingBottom: 20 }}>{t.noNotesBody}</p>}
      </details>
      <p className="dim" style={{ marginTop: 20, fontSize: "0.9rem" }}>
        {t.stored}
      </p>

      {h.tasks.map((task, i) => (
        <article className="task" key={task.q} aria-labelledby={`q${i}`}>
          <div className="task-q">
            <div>
              <span className="label">{dict.kinds[task.kind as keyof typeof dict.kinds] ?? task.kind}{duel.levels && !task.retention ? ` · ${fmt(dict.levels.tag, { n: task.level })}` : ""}</span>
              {task.retention && <span className="tag ret">{fmt(dict.levels.retention, { n: task.level })}</span>}
              <p className="q" id={`q${i}`}><Linked text={task.q} /></p>
            </div>
            <div className="src">
              <span className="label">{t.key}</span>
              <b className="mono">{/^0x[0-9a-f]{40}$/i.test(task.truth) ? <Linked text={task.truth} full /> : task.truth}</b>
              {t.sources[task.kind as keyof typeof t.sources]}
              {task.evidence.length > 0 && <span className="proofs"><span className="label">{dict.levels.evidence}</span>{task.evidence.map((e, j) => <Proof key={j} e={e} />)}</span>}
            </div>
          </div>
          <div className="duo">
            <Arm who="Holmes" a={task.holmes} t={t} />
            <Arm who="Moriarty" a={task.moriarty} t={t} />
          </div>
        </article>
      ))}

      <nav className="pager" aria-label="Hours">
        {prev ? <Link className="more" href={L(`/hours/${prev.hour}`)}><Back size={16} /> {fmt(t.a, { h: prev.hour }).replace(/[.。]$/, "")}</Link> : <span />}
        <Link className="more" href={L("/hours")}>{t.all}</Link>
        {next ? <Link className="more" href={L(`/hours/${next.hour}`)}>{fmt(t.a, { h: next.hour }).replace(/[.。]$/, "")} <Arrow size={16} /></Link> : <span />}
      </nav>
      <div style={{ height: 96 }} />
    </div>
  );
}
