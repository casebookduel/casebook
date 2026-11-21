"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Cross } from "@/components/Icons";
import Linked from "@/components/Linked";

type Step = { n: number; tool: string; args: Record<string, unknown>; out: string };
type Arm = { steps: Step[]; answer?: string | null; calls?: number; ok?: boolean };
type Task = { q: string; calls: number; commit: string; token: string };
type Key = { a: string; salt: string; checked: boolean; evidence: { what: string; tx?: string; logIndex?: number; getLogs?: { address: string; fromBlock: number; toBlock: number }; count?: number; eth_call?: { to: string } }[] };
type Quota = { left: number; limit: number; open: boolean; busy: boolean; duel?: number | null; holder?: string | null };
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type T = Record<string, string>;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
const hhmm = (ts: number) => new Date(ts * 1000).toISOString().slice(11, 16);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

function call(s: Step) {
  const a = s.args ?? {};   // a call that left out its main argument is shown as it was made, never as "undefined"
  if (s.tool === "rpc" && a.method != null) return <><b>rpc</b> {String(a.method)}({clip(JSON.stringify(a.params ?? []), 220)})</>;
  if (s.tool === "keccak" && a.text != null) return <><b>keccak</b>(&quot;{String(a.text)}&quot;)</>;
  if (s.tool === "words" && a.hex != null) return <><b>words</b>({clip(String(a.hex), 60)})</>;
  return <><b>{s.tool}</b>({clip(JSON.stringify(a), 160)})</>;
}

function Side({ who, arm, budget, t, live, final }: { who: "Holmes" | "Moriarty"; arm: Arm; budget: number; t: T; live: boolean; final?: { ok: boolean; answer: string | null } }) {
  const n = arm.calls ?? arm.steps.at(-1)?.n ?? 0;
  return (
    <section className={`arm ${who === "Holmes" ? "h" : "m"}`} aria-label={who}>
      <header>
        <b className={who === "Holmes" ? "holmes" : "moriarty"}>{who}</b>
        <span className="dim" style={{ fontSize: "0.88rem" }}>{fill(t.calls, { n, m: budget })}</span>
      </header>
      {final ? (
        <div className={`final ${final.ok ? "ok" : "no"}`}>
          {final.ok ? <Check /> : <Cross />}
          <span>{final.answer ? <span className="mono">{clip(final.answer, 120)}</span> : t.noAnswer}<span className="dim" style={{ display: "block", fontSize: "0.85rem" }}>{final.ok ? t.right : t.wrong}</span></span>
        </div>
      ) : arm.answer !== undefined ? (
        <div className="final"><span className="dim">{t.answered} <span className="mono">{arm.answer ? clip(arm.answer, 120) : t.noAnswer}</span></span></div>
      ) : (
        live && <p className="case-wait dim"><i aria-hidden="true" />{t.waiting}</p>
      )}
      <ol className="steps">
        {arm.steps.map((s, i) => (
          <li key={i} className="case-step"><div className="call mono">{call(s)}</div><div className="out mono">{clip(s.out, 240)}</div></li>
        ))}
      </ol>
    </section>
  );
}

export default function CaseDesk({ kinds, labels, t, caseHref, explorer, holder }: { kinds: string[]; labels: Record<string, string>; t: T; caseHref: string; explorer: string; holder?: { min: number; cases: number; t: T } }) {
  const [token, setToken] = useState("");
  const [kind, setKind] = useState(kinds[0]);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [arms, setArms] = useState<{ A: Arm; B: Arm }>({ A: { steps: [] }, B: { steps: [] } });
  const [key, setKey] = useState<Key | null>(null);
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [result, setResult] = useState<{ id: string; holmes: { ok: boolean; answer: string | null }; moriarty: { ok: boolean; answer: string | null } } | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);

  const [hBusy, setHBusy] = useState(false);
  const [hMsg, setHMsg] = useState("");
  const loadQuota = () => fetch("/api/case", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setQuota).catch(() => {});
  useEffect(() => { loadQuota(); }, []);

  // the key and salt arrive after both answers: hash them here, so the reader sees the key was the one fixed at the start
  useEffect(() => {
    if (!key || !task) return;
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${key.a}|${key.salt}`)).then((b) => setKeyOk(hex(b) === task.commit)).catch(() => setKeyOk(null));
  }, [key, task]);

  // the holder perk: sign one message with a browser wallet (no transaction); the server checks it and the balance
  async function signHolder() {
    if (!holder) return;
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) { setHMsg(holder.t.noWallet); return; }
    setHBusy(true);
    setHMsg(holder.t.signing);
    try {
      const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const { message } = (await fetch(`/api/holder?address=${address}`, { cache: "no-store" }).then((r) => r.json())) as { message: string };
      const signature = await eth.request({ method: "personal_sign", params: ["0x" + hex(new TextEncoder().encode(message).buffer as ArrayBuffer), address] });
      const r = (await fetch("/api/holder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, signature }) }).then((x) => x.json())) as { ok?: boolean; why?: string; balance?: string; min?: number };
      setHMsg(r.ok ? "" : r.why === "balance" ? fill(holder.t.low, { b: Number(r.balance ?? 0).toLocaleString("en-US"), min: (r.min ?? holder.min).toLocaleString("en-US") }) : holder.t.fail);
      if (r.ok) loadQuota();
    } catch {
      setHMsg(holder.t.fail);
    }
    setHBusy(false);
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const tok = token.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(tok)) { setMsg(t.errInput); setPhase("error"); return; }
    setMsg(""); setTask(null); setKey(null); setKeyOk(null); setResult(null); setArms({ A: { steps: [] }, B: { steps: [] } });
    setPhase("running");
    let ended = false, closed = false;   // closed: the server said the run is over (with no result, its free case is back)
    try {
      const r = await fetch("/api/case", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tok, kind }) });
      if (!r.ok || !r.body) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; until?: number };
        setMsg(j.error === "quota" ? t.noneLeft : j.error === "budget" ? t.closed : j.error === "duel" && j.until ? fill(t.duel, { t: hhmm(j.until) })
          : j.error === "busy" ? t.busy : j.error === "input" ? t.errInput : t.fail);
        setPhase("error");
        loadQuota();
        return;
      }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
          const ev = JSON.parse(buf.slice(0, i));
          buf = buf.slice(i + 1);
          if (ev.t === "task") setTask(ev);
          else if (ev.t === "step") setArms((a) => ({ ...a, [ev.arm]: { ...a[ev.arm as "A" | "B"], steps: [...a[ev.arm as "A" | "B"].steps, ev] } }));
          else if (ev.t === "answer") setArms((a) => ({ ...a, [ev.arm]: { ...a[ev.arm as "A" | "B"], answer: ev.answer, calls: ev.calls } }));
          else if (ev.t === "key") setKey(ev);
          else if (ev.t === "done") { setResult(ev); setPhase("done"); ended = true; }
          else if (ev.t === "skip") { setMsg(fill(t.skip, { why: ev.why })); setPhase("error"); ended = true; }
          else if (ev.t === "error") { setMsg(t.fail); setPhase("error"); ended = true; }
          else if (ev.t === "end") closed = true;
        }
      }
    } catch { /* the stream broke; the case may still be saved */ }
    if (!ended) { setMsg(closed ? t.fail : t.lost); setPhase("error"); }
    loadQuota();
  }

  const live = phase === "running";
  const can = !live && (!quota || (quota.left > 0 && quota.open && !quota.duel));
  return (
    <div className="case">
      <form className="panel case-form" onSubmit={start}>
        <label className="case-field">
          <span className="mlabel">{t.token}</span>
          <input className="mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t.tokenPh} spellCheck={false} autoComplete="off" inputMode="text" maxLength={42} aria-describedby="case-quota" />
        </label>
        <fieldset className="case-kinds">
          <legend className="mlabel">{t.question}</legend>
          <div className="pick">
            {kinds.map((k) => (
              <label key={k} className={k === kind ? "on" : ""}>
                <input type="radio" name="kind" value={k} checked={k === kind} onChange={() => setKind(k)} />
                {labels[k] ?? k}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="case-go">
          <button className="btn btn-solid" type="submit" disabled={!can}>{live ? t.running : t.start}</button>
          <p id="case-quota" className="dim">{quota ? (!quota.open ? t.closed : quota.duel ? fill(t.duel, { t: hhmm(quota.duel) }) : quota.left > 0 ? fill(t.left, { n: quota.left, m: quota.limit }) : t.noneLeft) : "\u00a0"}</p>
        </div>
        {holder && (
          <div className="case-holder">
            {quota?.holder ? (
              <p className="holmes">{fill(holder.t.ok, { a: `${quota.holder.slice(0, 6)}…${quota.holder.slice(-4)}`, n: holder.cases })}</p>
            ) : (
              <>
                <p className="dim">{fill(holder.t.offer, { min: holder.min.toLocaleString("en-US"), n: holder.cases })}</p>
                <button type="button" className="btn btn-line btn-sm" onClick={signHolder} disabled={hBusy}>{holder.t.connect}</button>
                <p className="dim case-holder-note">{hMsg || holder.t.note}</p>
              </>
            )}
          </div>
        )}
        <p className="case-same dim">{t.same}</p>
      </form>

      <div aria-live="polite">{msg && <p className={`case-msg ${phase === "error" ? "no" : ""}`}>{msg}</p>}</div>

      {task && (
        <div className="case-live">
          <div className="task-q">
            <div>
              <span className="label">{labels[kind] ?? kind}</span>
              <p className="q"><Linked text={task.q} /></p>
            </div>
            <div className="src">
              <span className="label">{t.key}</span>
              {key ? (
                <>
                  <b className="mono">{/^0x[0-9a-f]{40}$/i.test(key.a) ? <Linked text={key.a} full /> : key.a}</b>
                  <span className={`commit ${keyOk ? "ok" : ""}`}>{keyOk ? fill(t.keyCheck, { a: key.a, s: key.salt }) : fill(t.commit, { h: task.commit.slice(0, 16) + "…" })}</span>
                  {key.checked && <span className="commit ok">{t.checked}</span>}
                  <span className="proofs">
                    {key.evidence.map((e, j) => {
                      const href = e.tx ? `${explorer}/tx/${e.tx}` : e.getLogs ? `${explorer}/address/${e.getLogs.address}?tab=logs` : e.eth_call ? `${explorer}/address/${e.eth_call.to}` : "";
                      const label = e.tx ? `${e.what} · tx ${e.tx.slice(0, 10)}…` : e.getLogs ? `${e.what} · blocks ${e.getLogs.fromBlock}–${e.getLogs.toBlock}${e.count !== undefined ? ` · ${e.count}` : ""}` : e.what;
                      return href ? <a key={j} className="addr mono" href={href} target="_blank" rel="noreferrer">{label}</a> : <span key={j} className="mono">{label}</span>;
                    })}
                  </span>
                </>
              ) : (
                <span className="commit">{fill(t.commit, { h: task.commit.slice(0, 16) + "…" })}</span>
              )}
            </div>
          </div>
          <div className="duo">
            <Side who="Holmes" arm={arms.A} budget={task.calls} t={t} live={live} final={result?.holmes} />
            <Side who="Moriarty" arm={arms.B} budget={task.calls} t={t} live={live} final={result?.moriarty} />
          </div>
          {result && (
            <p className="case-saved">
              {fill(t.saved, { id: result.id })} <Link className="more" href={`${caseHref}/${result.id}`}>{t.open}</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
