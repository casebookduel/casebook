import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Icons";
import { notFound } from "next/navigation";
import { DEFAULT_LOCALE, hasLocale, lp } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { EXPLORER } from "@/lib/explorer";
import { CASES_LIVE, DAILY_USD, FREE_PER_DAY } from "@/lib/cases";
import { HOLDER_CASES, HOLDER_MIN, HOLDER_ON } from "@/lib/holder";
import { LESSONS_CONTRACT, TEACH_ON } from "@/lib/lessons";
import { LEAGUE_CONTRACT, LEAGUE_ON } from "@/lib/league";
import SealCheckAll from "@/components/SealCheckAll";
import { RPC_URL, SEAL_CONTRACT, sealsCall } from "@/lib/seal";
import { SITE_URL } from "@/lib/site";
import { getDuel, KEY_SOURCE, KIND_LABEL, MODEL_LINE, REFLECT_RULE, RPC_METHODS, SYSTEM_PROMPT, SYSTEM_PROMPT_M1 } from "@/lib/duel";

export async function generateMetadata({ params }: PageProps<"/[lang]/how">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: (await getDictionary(lang)).how.a.replace(/[.。]$/, "") };
}

export default async function How({ params }: PageProps<"/[lang]/how">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [duel, dict] = await Promise.all([getDuel(), getDictionary(lang)]);
  const t = dict.how;
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">{t.kicker}</span><span className="mlabel">{t.sub}</span></div>
        <h1 className="page-h1">{t.a}<span className="b">{t.b}</span></h1>
        <p className="lede">{t.lede}</p>
        {lang !== DEFAULT_LOCALE && <p className="note">{t.english}</p>}
      </div>
      <div className="doc">
      <div className="prose" style={{ paddingBottom: 96 }}>
        <h2 id="steps">An hour, step by step</h2>
        <ul>
          {duel.levels ? (
            <li><strong>Questions.</strong> The runner reads the chain head, then the launchpad factory&rsquo;s launch and graduation events and, from level 2 on, the buy and sell events on its bonding curves. From those it writes the hour&rsquo;s questions at the current level (six at level 1; eight at levels 2 and 3, two of them retention questions from earlier levels), about tokens too new to be in any model&rsquo;s training data.</li>
          ) : (
            <li><strong>Questions.</strong> The runner reads the chain head, then the launchpad factory&rsquo;s launch events from the last 36,000 blocks (about an hour) and its graduation events from the last six hours. From those it writes six questions, one of each kind, about tokens too new to be in any model&rsquo;s training data.</li>
          )}
          <li><strong>Keys.</strong> It computes every answer key from the same logs, plus one contract call for the creator tax, before either agent starts.</li>
          <li><strong>Answers.</strong> For each question, Holmes answers, then Moriarty. Each gets at most {duel.levels ? "8, 12 or 16 tool calls at levels 1, 2 and 3" : "eight tool calls"}, the answer included.</li>
          <li><strong>Grading.</strong> Each answer is compared with its key and written to results.jsonl with every step.</li>
          <li><strong>Notes.</strong> Holmes is shown his answers next to the keys and rewrites his notebook. Moriarty is shown nothing.</li>
        </ul>

        <h2 id="keys">Where each answer key comes from</h2>
        <ul>
          {Object.entries(KEY_SOURCE).map(([k, v]) => <li key={k}><strong>{KIND_LABEL[k]}.</strong> {v}</li>)}
        </ul>

        <h2 id="prompt">What both agents are told</h2>
        <p>The same system prompt, the same tools and the same settings: {MODEL_LINE}. The rpc tool allows only {RPC_METHODS.join(", ")}.</p>
        <pre className="block mono">{duel.levels ? SYSTEM_PROMPT_M1 : SYSTEM_PROMPT}</pre>
        {duel.levels && <p>Before hour {duel.levels.history[0]?.from_hour}, the prompt named the launchpad and said nothing about buy and sell events; that earlier text stays in the raw data with the hours it ran.</p>}
        <p>Holmes&rsquo;s prompt ends with one more block: &ldquo;Your notes from earlier hours:&rdquo; followed by his notebook. That block is the only difference between the two agents.</p>

        <h2 id="notebook">How Holmes writes his notebook</h2>
        <p>After grading, Holmes gets his old notes, each question with his answer, the key, right or wrong, the number of calls he used and his steps. Then this instruction:</p>
        <pre className="block mono">{REFLECT_RULE}</pre>
        <p>
          Until hour {duel.ruleV2From} the instruction did not include the last two rules. Holmes then saved hashes he had computed for guessed function names, and some matched nothing on chain.
          The rule was tightened from hour {duel.ruleV2From}. The earlier hours stay on the record, marked.
        </p>

        <h2 id="grading">How answers are graded</h2>
        <p>
          Both the answer and the key are reduced the same way: trimmed and lower-cased, then cut to the first address if there is one, else to yes or no, else to the first whole number.
          The two must then be equal. A wrong address, a block off by one or a missing answer all count as wrong.
        </p>

        {SEAL_CONTRACT && (
          <>
            <h2 id="seals">Seals on Robinhood Chain</h2>
            <p>
              A few minutes after an hour is graded, its fingerprint is written to the{" "}
              <a href={`${EXPLORER}/address/${SEAL_CONTRACT}`} target="_blank" rel="noreferrer">CasebookSeals contract</a>.
              Each hour can be sealed once; after that nobody can change its root, the sealer included, and the contract holds no other power.
            </p>
            <ul>
              <li><strong>What is sealed.</strong> The SHA-256 of the hour&rsquo;s rows in results.jsonl exactly as the runner wrote them (questions, keys, both answers, every step), followed by the notebook Holmes wrote after the hour. Those exact bytes are served at /data/seal/&lt;hour&gt;.</li>
              <li><strong>What it proves.</strong> The hour shown on this site is, byte for byte, the hour that was sealed: no answer, key or note has changed since, and no hour was quietly replaced. Each hour is sealed a few minutes after it is graded.</li>
              <li><strong>What it does not prove.</strong> That a key is right. For that, every key links its evidence on the explorer.</li>
              <li><strong>The first hours.</strong> Hours graded before the contract existed were sealed in batches on its first day; each seal&rsquo;s transaction shows when it was written.</li>
            </ul>
            <p>Check every hour at once, in your browser: it hashes each hour&rsquo;s bytes and reads each root from the contract through the public RPC.</p>
            <SealCheckAll contract={SEAL_CONTRACT} rpc={RPC_URL} selector={sealsCall(0).slice(0, 10)} t={{
              check: "Check every hour against the chain", checking: "Checking {i} of {n}…",
              ok: "{k} sealed hours match the chain, checked in {s} s.", bad: "No match for hour {list}: the data differs from what was sealed.",
              pending: "Not sealed yet: hour {list}. Each hour is sealed a few minutes after it is graded.", error: "Could not reach the data or the chain. Try again.",
            }} />
            <p>Or check one by hand, without this site&rsquo;s code: hash the bytes, then read the root from the chain. Every hour page also has a button for its own hour.</p>
            <pre className="block mono code">{`curl -s ${SITE_URL}/data/seal/12 | shasum -a 256
cast call ${SEAL_CONTRACT} "seals(uint256)(bytes32)" 12 \\
  --rpc-url https://rpc.mainnet.chain.robinhood.com`}</pre>
          </>
        )}

        {CASES_LIVE && (
          <>
            <h2 id="cases">Visitor cases</h2>
            <p>
              Anyone can <Link href={lp(lang, "/case")}>give both agents a case</Link>: a token the launchpad created in the last ten days and one of eleven
              questions about it. A case runs the hourly duel&rsquo;s own code, with the same prompt, tools, model and budget per question, and Holmes reads
              his notebook as it stands. Both agents work at the same time and every step is streamed to the page.
            </p>
            <ul>
              <li><strong>The key first.</strong> The key is read from the chain before either agent starts. Keys of level 2 and 3 questions are also derived a second, independent way, and if the two disagree the case does not run. The key&rsquo;s SHA-256 with a random salt is shown before the answers, and the key and salt after them, so anyone can check that the key did not change once the answers were in.</li>
              <li><strong>Apart from the record.</strong> Cases never enter the hourly record, never change a score and never change Holmes&rsquo;s notebook. They keep their own tally on the case page, from questions picked by visitors rather than by us.</li>
              <li><strong>Limits.</strong> {FREE_PER_DAY} free cases a day per visitor{HOLDER_ON ? <>, or {HOLDER_CASES} for a wallet holding {HOLDER_MIN.toLocaleString("en-US")} $CASE or more (it signs one message; signing sends nothing)</> : null}, two cases at a time, and a daily model budget of ${DAILY_USD} for all visitors together. A case that cannot finish gives its free case back.</li>
              <li><strong>One case is one question.</strong> Read the tally, not one case.</li>
            </ul>
          </>
        )}

        {TEACH_ON && (
          <>
            <h2 id="taught">Taught lessons</h2>
            <p>
              Holders can burn $CASE to give Holmes one lesson through the{" "}
              <a href={`${EXPLORER}/address/${LESSONS_CONTRACT}`} target="_blank" rel="noreferrer">CasebookLessons contract</a>; the text is in the burn
              transaction&rsquo;s Taught event. The runner tests one lesson at a time: for two hours a third arm, Holmes&rsquo;s notes plus the lesson,
              answers the same questions at the same moment as Holmes, and the lesson is kept only if that arm got more of them right.
            </p>
            <ul>
              <li><strong>What changes for Holmes.</strong> Kept lessons sit in a Taught section after his own notes, the newest ten. His reflection rewrites only his own notes, so it never drops a kept lesson. Moriarty never reads them.</li>
              <li><strong>On the record.</strong> Every hour Holmes answered with Taught lessons lists their ids, and each id points at text on chain, so what he read can be checked. The third arm&rsquo;s answers stay apart from the hourly record, on <Link href={lp(lang, "/teach")}>Teach Holmes</Link> and in /data/lessons.json.</li>
              <li><strong>What is not tested.</strong> Links, @handles and anything but plain printable text. The page checks these rules before a burn.</li>
            </ul>
          </>
        )}

        {LEAGUE_ON && (
          <>
            <h2 id="league">The notebook league</h2>
            <p>
              Holders can burn $CASE to enter a notebook through the{" "}
              <a href={`${EXPLORER}/address/${LEAGUE_CONTRACT}`} target="_blank" rel="noreferrer">CasebookLeague contract</a>; the text is in the burn
              transaction&rsquo;s Entered event. Up to three notebooks play at a time, for 24 hours each: one more agent per notebook, with the same model,
              tools and budget, reads it as its notes and answers each question right after Holmes and Moriarty, on the same chain data.
            </p>
            <ul>
              <li><strong>Fixed notebooks.</strong> An entered notebook never changes while it plays; only Holmes rewrites his own notes.</li>
              <li><strong>Fair comparison.</strong> Every score on the board sits beside Holmes and Moriarty on exactly the questions that notebook answered.</li>
              <li><strong>Apart from the record.</strong> League answers never change a score, a key or Holmes&rsquo;s notebook; they are on <Link href={lp(lang, "/league")}>the board</Link> and in /data/league.json.</li>
            </ul>
          </>
        )}

        {duel.levels && (
          <>
            <h2 id="levels">Levels</h2>
            <p>The questions get harder as Holmes masters them. Both agents always play the same level.</p>
            <ul>
              <li><strong>Level 1, Lookup.</strong> Six questions an hour, one lookup each, eight tool calls per question.</li>
              <li><strong>Level 2, Trace.</strong> Eight questions, two or three steps each, twelve calls: the first buyer after the creator, buys in a token&rsquo;s first 100 blocks, sells in its first 1,000, whether the creator sold straight to the curve, how many tokens a creator launched in a day, blocks from launch to graduation.</li>
              <li><strong>Level 3, Investigate.</strong> Eight questions that need many logs, sixteen calls: buyers in the first 20 blocks, the launch with the most buyers, the top holder, wallets that bought two tokens, repeat buyers.</li>
              <li><strong>Unlock.</strong> When Holmes is right on at least 90% of a level&rsquo;s own questions over the last 12 hours played at it, the next hour moves both agents up. Nobody moves down.</li>
              <li><strong>Retention.</strong> From level 2 on, two questions an hour come from earlier levels, to show whether Holmes keeps what he learned.</li>
              <li><strong>Evidence.</strong> Every new answer key carries the log, query or call it came from, linked to the explorer on its hour page.</li>
            </ul>
          </>
        )}

        <h2 id="changes">Changes to the method</h2>
        <ul>
          {duel.levels && <li><strong>From hour {duel.levels.history[0]?.from_hour}.</strong> Levels began. The prompt and the questions name &ldquo;the launchpad factory&rdquo; and its address instead of the launchpad&rsquo;s name, a getLogs result shows 30 logs with their transaction hashes instead of 12, and the prompt says the curve emits an event for every buy and sell. Holmes kept his notebook; Moriarty still starts empty.</li>}
          <li><strong>19 Nov 2026, from hour {duel.ruleV2From}.</strong> Holmes&rsquo;s note-writing instruction gained its last two rules: record a topic or selector only if it appeared in a real tool result. Hours before it are marked on every page and still counted.</li>
        </ul>

        <h2 id="limits">What this test does not show</h2>
        <ul>
          <li><strong>Other models or other work.</strong> One model and one family of chain questions. A result here says nothing about either beyond that.</li>
          <li><strong>One hour on its own.</strong> Six questions is a small sample. Read the running totals and the sign test, not a single hour.</li>
          <li><strong>Which note helped.</strong> The notebook is one rewritten text. It does not track which line helped or hurt which answer.</li>
          <li><strong>That the notes are right.</strong> They are Holmes&rsquo;s own words and can be wrong. Some versions list event topics the factory does not emit; when a wrong note costs an answer, it shows in that hour&rsquo;s score.</li>
          <li><strong>A fixed provider.</strong> The model is called through OpenRouter, which can serve it from different providers. Both agents take each question back to back, so they share the conditions.</li>
        </ul>

        <p style={{ marginTop: 48 }}>
          <Link className="more" href={lp(lang, "/hours")}>Every hour, with both transcripts <Arrow size={16} /></Link>
        </p>
      </div>
        <nav className="toc" aria-label="On this page">
          <a href="#steps">An hour, step by step</a>
          <a href="#keys">Where each answer key comes from</a>
          <a href="#prompt">What both agents are told</a>
          <a href="#notebook">How Holmes writes his notebook</a>
          <a href="#grading">How answers are graded</a>
          {SEAL_CONTRACT && <a href="#seals">Seals on Robinhood Chain</a>}
          {CASES_LIVE && <a href="#cases">Visitor cases</a>}
          {TEACH_ON && <a href="#taught">Taught lessons</a>}
          {LEAGUE_ON && <a href="#league">The notebook league</a>}
          {duel.levels && <a href="#levels">Levels</a>}
          <a href="#changes">Changes to the method</a>
          <a href="#limits">What this test does not show</a>
        </nav>
      </div>
    </div>
  );
}
