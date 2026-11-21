import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Arrow } from "@/components/Icons";
import Terminal from "@/components/Terminal";
import { hasLocale, lp } from "@/i18n/config";
import { ENGINE_LIVE, GITHUB_URL } from "@/lib/site";
import { getDuel } from "@/lib/duel";
import { checkLine } from "@/lib/facts";
import { OPEN } from "@/lib/open";

export const metadata: Metadata = { title: "Memory engine", description: "casebook-memory: memory for coding agents, with a receipt for every memory. MCP server and CLI, MIT." };

// The example output is a real session: Claude Code answered from this memory, then reported the task solved.
const STEPS = [
  { cmd: "npx casebook-memory init", out: 'Memory store: ./.casebook\nClaude Code: added "casebook" to ./.mcp.json. Restart Claude Code in this folder and approve the server.' },
  { cmd: 'npx casebook-memory remember "To cut a release in this project run: make ship TAG=<version>. Plain git tags are not picked up by CI."', out: "Stored as m1, on probation." },
  { cmd: "npx casebook-memory show m1", out: "[m1] To cut a release in this project run: make ship TAG=<version>. Plain git tags are not picked up by CI.\nreceipt: used 1 time · solved 1, failed 0 · uplift not measured yet · probation\n#2  served by index\n#3  outcome solved" },
];

const DUEL = `{
  "agent": "claude -p --mcp-config .mcp.json --allowedTools mcp__casebook__recall,mcp__casebook__outcome,Edit,Bash",
  "tasks": [
    {
      "id": "dates",
      "prompt": "Fix the failing test in src/dates.test.ts.",
      "check": "npm test -- dates"
    }
  ],
  "isolate": "worktree",
  "setup": "npm ci"
}`;

export default async function Install({ params }: PageProps<"/[lang]/install">) {
  const { lang } = await params;
  if (!hasLocale(lang) || !ENGINE_LIVE) notFound();
  // Holmes's notebook as the command will import it: the facts in his latest notes (headings and lines wrong on chain
  // left out), and his score over the last 24 hours
  const duel = OPEN.has("skill") ? await getDuel() : null, notes = duel?.notes.at(-1), last = duel?.hours.slice(-24) ?? [];
  const facts = notes ? notes.text.split("\n").map((l) => l.trim()).filter((l) => l && !l.endsWith(":") && !checkLine(l)).length : 0;
  const sum = (k: "holmes" | "moriarty" | "n") => last.reduce((s, h) => s + h[k], 0);
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">Memory engine</span><span className="mlabel">casebook-memory · MIT</span></div>
        <h1 className="page-h1">Memory with receipts.<span className="b">For your own agent.</span></h1>
        <p className="lede">
          Most memory tools keep whatever they are told and never learn whether it helped. casebook-memory keeps a receipt for every memory: how often it was in the agent&rsquo;s context, how those tasks ended, and what it measurably added. Memories that hurt or do nothing are retired.
        </p>
      </div>
      <div className="install-term"><Terminal steps={STEPS} title="Terminal · your project" /></div>
      <div className="doc">
        <div className="prose" style={{ paddingBottom: 96 }}>
          <h2 id="gets">What your agent gets</h2>
          <ul>
            <li><strong>An index in context.</strong> When a session starts, the MCP server sends a short index of the project&rsquo;s memories as its instructions, within a token budget (500 by default). Proven memories come first.</li>
            <li><strong>Four tools.</strong> <code>recall</code> searches the memories and shows each receipt; <code>remember</code> stores one checked lesson; <code>outcome</code> reports solved or failed when the task is done; <code>forget</code> retires a memory that is wrong.</li>
            <li><strong>Guards.</strong> Anything that looks like a key, token, private key or seed phrase is refused. Duplicates are merged. Two memories that make the same claim with different values, or with a negation only one of them has, are flagged on both.</li>
            <li><strong>Any MCP client.</strong> <code>init</code> writes <code>.mcp.json</code> for Claude Code and prints the lines for Codex. Node 20 or later, no dependencies, everything in a local folder.</li>
          </ul>

          <h2 id="receipt">The receipt</h2>
          <ul>
            <li><strong>Used.</strong> Times the memory was in the agent&rsquo;s context, through the index or a recall.</li>
            <li><strong>Solved and failed.</strong> Outcomes reported for the tasks it was in context for.</li>
            <li><strong>Uplift.</strong> Measured by leave-one-out checks, below. Empty until measured.</li>
            <li><strong>Status.</strong> On probation, active (measured help) or retired (hurt, no effect, or forgotten), with the reason.</li>
          </ul>

          <h2 id="duel">Measured, not guessed</h2>
          <p>Write the tasks you care about, each with a command that exits 0 when the task is solved, in <code>casebook.duel.json</code>:</p>
          <pre className="block mono code">{DUEL}</pre>
          <pre className="block mono code">npx casebook-memory duel --runs 3 --ablate</pre>
          <ul>
            <li><strong>With and without.</strong> Every task runs twice: with memory and without, each in a clean checkout, graded by its own check. The summary gives a paired two-sided sign test.</li>
            <li><strong>Leave one out.</strong> With <code>--ablate</code>, the task runs again with all memories but one. The difference is that memory&rsquo;s uplift.</li>
            <li><strong>Promotion and retirement.</strong> After three checks, a memory with uplift above zero becomes active; one at zero or below is retired, and its receipt says why.</li>
          </ul>

          <h2 id="verify">Check the record</h2>
          <p>
            Every event (remember, serve, outcome, trial, status) is appended to <code>.casebook/log.jsonl</code> with the SHA-256 of the event before it, and every receipt is replayed from that log. <code>npx casebook-memory verify</code> walks the chain; an edited count or a deleted event breaks it.
          </p>

          {notes && (
            <>
              <h2 id="notebook">Holmes&rsquo;s notebook, for your agent</h2>
              <p>
                Holmes&rsquo;s notebook is what he has learned about Robinhood Chain from being graded every hour. One command puts it into your own agent, one memory per fact, each with its receipt.
              </p>
              <pre className="block mono code">{`npx casebook-memory holmes        # shows what it would store
npx casebook-memory holmes --yes  # stores it, every line on probation`}</pre>
              <ul>
                <li><strong>Checked before it enters your agent.</strong> The command downloads the hour&rsquo;s sealed bytes, hashes them and compares the hash with the root on Robinhood Chain, and the notebook has to be the end of those bytes. If either check fails, nothing is stored.</li>
                <li><strong>Your outcomes decide.</strong> Every line starts on probation with the hour as its source, so your own outcomes and duels keep the lines that help and retire the rest. Lines that name an event the factory never emits are left out.</li>
                <li><strong>Kept current.</strong> Run it again later: new lines are stored, and the lines Holmes has dropped are retired with that reason.</li>
              </ul>
              <p className="dim">Now: the notebook he wrote after hour {notes.hour}, {facts} facts. Over the last {last.length} hours Holmes got {sum("holmes")} of {sum("n")} right with it; Moriarty, with no notes, {sum("moriarty")}. <a href="/data/notebook.json">The notebook as the command reads it</a>.</p>
            </>
          )}

          <h2 id="holmes">Holmes and the engine</h2>
          <p>
            Holmes, in the hourly duel on this site, keeps one notebook and rewrites it after every graded hour. The engine keeps separate lessons instead, so each one can carry its own receipt. What they share is the test: the same tasks with memory and without, graded by something that is not a model.
          </p>

          <h2 id="limits">Limits</h2>
          <ul>
            <li>In everyday sessions an outcome credits every memory that was in context; only leave-one-out checks separate them.</li>
            <li>The contradiction check works on words, so it flags and never decides.</li>
            <li>Recall is keyword search (BM25) with no embeddings, so wording matters.</li>
            <li>The store is a local folder; a team shares it by committing the log.</li>
          </ul>

          <p style={{ marginTop: 48, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <a className="more" href="https://www.npmjs.com/package/casebook-memory" target="_blank" rel="noreferrer">npm <Arrow size={16} /></a>
            {GITHUB_URL && <a className="more" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub <Arrow size={16} /></a>}
            <Link className="more" href={lp(lang, "/how")}>How the hourly duel works <Arrow size={16} /></Link>
          </p>
        </div>
        <nav className="toc" aria-label="On this page">
          <a href="#gets">What your agent gets</a>
          <a href="#receipt">The receipt</a>
          <a href="#duel">Measured, not guessed</a>
          <a href="#verify">Check the record</a>
          <a href="#holmes">Holmes and the engine</a>
          <a href="#limits">Limits</a>
        </nav>
      </div>
    </div>
  );
}
