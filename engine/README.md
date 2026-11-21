# casebook-memory

Memory for coding agents, with a receipt for every memory.

Most memory tools keep whatever they are told and never learn whether it helped. Casebook keeps a receipt for each
memory: how often it was in the agent's context, how those tasks ended, and its measured uplift. Memories that hurt or
do nothing are retired.

It is an MCP server and a CLI. It needs Node 20 or later and has no dependencies. Everything stays in a local folder.

## Install

```sh
npx casebook-memory init
```

This creates `.casebook/` and adds a `casebook` server to `.mcp.json`, which Claude Code reads. Restart Claude Code in
the folder and approve the server. `init` also prints the lines for Codex (`~/.codex/config.toml`). Any MCP client
works.

## How it works

- **Index.** When a session starts, the server sends a short index of the project's memories as its MCP instructions.
  The index keeps to a token budget (500 by default, set in `.casebook/config.json`). Proven memories come first.
- **Tools.**
  - `recall`: search the memories, with each one's receipt.
  - `remember`: store one checked lesson.
  - `outcome`: report `solved` or `failed` when the task is done.
  - `forget`: retire a memory that is wrong.
- **New memories** start on probation.
  - Anything that looks like a key, token, private key or seed phrase is refused.
  - Duplicates are merged.
  - Possible contradictions (the same claim with other values, or with a negation) are flagged on both memories.

## Receipts

| Field | Meaning |
|---|---|
| used | Times the memory was in the agent's context, through the index or a recall. |
| solved, failed | Outcomes reported for tasks it was in context for. |
| uplift | Measured by leave-one-out checks (below). Empty until measured. |
| status | `probation`, `active` (measured help) or `retired` (hurt, no effect, or forgotten), with the reason. |

## Measured, not guessed: the duel

Write the tasks you care about, each with a command that exits 0 when the task is solved:

```json
{
  "agent": "claude -p --mcp-config .mcp.json --allowedTools mcp__casebook__recall,mcp__casebook__outcome,Edit,Bash",
  "tasks": [
    { "id": "dates", "prompt": "Fix the failing test in src/dates.test.ts.", "check": "npm test -- dates" }
  ],
  "isolate": "worktree",
  "setup": "npm ci"
}
```

```sh
npx casebook-memory duel --runs 3 --ablate
```

- **A and B.** Every task runs twice, with memory (A) and without (B), and is graded by its `check` command.
  - `"isolate": "worktree"` gives each run a clean git checkout, so one arm's edits never reach the other.
  - The agent gets the prompt on stdin.
  - The summary has a paired two-sided sign test.
- **Leave-one-out.** With `--ablate`, A runs again without each memory that was in its context. The difference is that
  memory's uplift.
- **Status.** After 3 checks:
  - a memory with uplift above 0 becomes active;
  - one with uplift at 0 or below is retired, with the reason.
- **Cost.** One duel costs runs × tasks × (2 + memories in context) agent runs.
- **Files.** Transcripts and `result.json` go to `.casebook/duels/`.

## Verify

```sh
npx casebook-memory verify
```

Every event in `.casebook/log.jsonl` (remember, serve, outcome, trial, status) carries the SHA-256 of the event before
it. Each receipt is recomputed from this log, so an edited count or a deleted event breaks the chain.

## CLI

```
init [--local]            add the MCP server to this project and create .casebook/
remember <text> [--tags a,b]
recall <query> [--k 5]
list [--all]              memories and their receipts
show <id>                 one memory, its receipt and every event behind it
outcome solved|failed     credit the memories served since the last outcome
forget <id> [--reason r]  retire a memory
index                     what the agent sees at the start of a session
duel [file] [--runs n] [--ablate | --ablate=m1,m2]
verify                    check the hash chain behind every receipt
mcp                       run the MCP server on stdio
```

`--dir <path>` or `CASEBOOK_DIR` picks the store. Otherwise the CLI uses the nearest `.casebook/` above the current
folder.

## Library

```js
import { Store } from "casebook-memory";

const store = Store.find();
store.remember("Release with make ship TAG=<version>; plain git tags are not picked up by CI.", ["release"]);
console.log(store.recall("how do I release"));
```

## Limits

- **Credit is shared.** In everyday sessions, an outcome credits every memory that was in context. Only leave-one-out
  checks separate one memory from another.
- **Contradictions are only flagged.** The check works on words, so it flags and never decides.
- **Recall is keyword search** (BM25) with no embeddings, so wording matters.
- **One machine.** The store is a local folder; share it by committing `.casebook/log.jsonl`.
- **POSIX shell.** `duel` runs commands with `sh`: macOS, Linux or WSL.

## License

MIT
