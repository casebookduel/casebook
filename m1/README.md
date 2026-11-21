# M1: the duel with levels

`duel.py` is M0's runner with difficulty levels. The machinery is M0's: the DNS pin, `rpc` with retries, getLogs range
halving, the four tools (rpc, keccak, words, answer), `solve`, `reflect`, `norm` grading and the spend cap. Output goes
to `m1/out/`.

## Commands

    python3 m1/duel.py dry 1|2|3     one hour of questions for that level from the chain head, with keys and evidence
    python3 m1/duel.py check [2|3]   the same, plus every L2/L3 key re-derived a second way and the topics checked
    python3 m1/duel.py once          one hour at the current level (calls the model)
    python3 m1/duel.py run [hours]   hourly loop, default 24, stops at DUEL_CAP (calls the model)
    python3 m1/duel.py report        accuracy per level and arm, paired sign test, retention, cost
    python3 m1/duel.py seed M0_OUT   continue from M0 (see below)

`dry`, `check`, `report` and `seed` need no API key and never call a model.

## Continuing from M0

`seed M0_OUT` copies M0's `results.jsonl`, `notes_hNN.md`, `notes_latest.md` and `run.log` into `m1/out/`. It refuses
when `m1/out/` already has results. The next hour is the one after M0's last hour (the hour count, unless a failed hour
left a gap). `level.json` starts at level 1 with `since_hour` and `from_hour` set to that next hour. M0 rows have no
`level`, `retention` or `evidence`, so they read as level 1, not retention, with evidence `""`. The unlock rule and
`report` count them as L1 hours, and `report` marks those hours `(M0)`. Holmes continues from M0's notes as they are.

## Levels

| Level | Questions an hour | Calls each | Kinds |
|---|---|---|---|
| L1 Lookup | 6 | 8 | creator, curve, launch_block, tax, count, graduated (M0's logic) |
| L2 Trace | 6 + 2 retention | 12 | first_buyer, buys_100, sells_1000, creator_sold, creator_launches, grad_blocks |
| L3 Investigate | 6 + 2 retention | 16 | snipers, most_buyers, top_holder, both_buyers, repeat_buyers |

- **Retention.** From L2 on, 2 of the hour's 8 questions come from earlier levels: two L1 kinds in an L2 hour, one L1
  and one L2 kind in an L3 hour. They are built fresh from the current chain and keep their own level's call budget.
  Rows mark them `"retention": true`, and their `level` is the question's own level.
- **Unlock.** After each hour: if Holmes is right on at least 90% of the current level's own (non-retention) questions
  over the last 12 hours played at that level, the next hour starts the next level for both arms. L3 is the top for
  now, and there is no demotion. The state is `out/level.json`:
  `{"level", "since_hour", "history": [{"level", "from_hour"}]}`.
- A kind whose chain data cannot give a clean key is skipped for the hour (the reason goes to `run.log`), and another
  kind of the same level takes its slot.

## Keys and evidence

Every key is an address, an integer or yes/no. Every L2 and L3 key comes from logs, which stay checkable for good.
L1's `tax` is an eth_call of a fixed setting. Every row has `evidence`: the launch, buy or graduation logs used (tx hash
and log index), or the getLogs query (address, topics, block range) with its count, or the eth_call with its block.
`check` re-derives each L2/L3 key independently: the token's own Transfer events instead of the curve's Buy and Sell
events, Sell events instead of Transfers, a server-side topic filter instead of a client-side count, and
`balanceOf`/`totalSupply` instead of summed Transfers.

## Changes from M0 (a method boundary on the record)

- Prompts and questions name "the launchpad factory 0x7ed5…" (full address), never the launchpad's name.
- A getLogs result shows its count and the first 30 logs (M0: 12) plus each log's tx hash. L3 questions are chosen so
  that every query they need fits in one 30-log page. The allowed RPC methods are M0's.
- Holmes keeps one notebook (`out/notes_latest.md`) across levels: empty on a fresh start, M0's after `seed`.

## Chain facts the keys rely on (checked against real logs, 20 Nov 2026)

- Launch event (factory): topics token, curve, creator. Data word 0 is the quote token: zero for ETH-paired curves,
  otherwise an ERC-20 (about half of launches).
- Buy event (curve): topic 1 is the caller, topic 2 the address that receives the tokens (always the curve's Transfer
  recipient). Sell event: topic 1 is the caller, whose tokens go to the curve; topic 2 receives the proceeds. About 80%
  of sells come through routers, so a "distinct sellers" kind would mostly count routers. `sells_1000` counts Sell
  events instead.
- The curve emits its own graduation event, usually in the factory's graduation tx but sometimes 1–100 blocks
  earlier. `grad_blocks` uses only tokens where both share one tx.
- The RPC serves historical state for only about the last 6,000 blocks (10 minutes). No key depends on it: an
  `eth_getBalance` kind was dropped, because the two arms could not be sure to see the same block, and readers could
  not re-check the key later.

## Visitor cases (`case.py`)

One question about one token, picked by a visitor on the site's /case page, answered by both arms with this runner's
own prompt, tools, model and per-level budget.

```sh
python3 case.py kinds                # the 11 kinds a case can ask
python3 case.py key 0x<token> snipers  # the question, key and evidence only; no model call
python3 case.py 0x<token> snipers      # the full case, one JSON event per line (needs OPENROUTER_API_KEY)
```

- The token must come from the launchpad factory within the last 9,000,000 blocks (about 10 days).
- The key comes first. Level 2 and 3 keys are derived a second way with `verify`; when the two disagree, or the chain
  cannot give a clean key (a router in the first buy, a creator who moved tokens elsewhere), the case stops with a
  `skip` event before any model call.
- A salted SHA-256 of the key is printed before the arms start and the key and salt after, so the page can show the key
  was fixed in advance. Holmes reads `DUEL_DIR/notes_latest.md` as it is; nothing is written back.
- Each finished case goes to `CASE_DIR/cases/<id>.json` and one line in `CASE_DIR/cases.jsonl` (default `m1/cases`).
  Its model spend is kept in `CASE_DIR/spend.json`, apart from the duel's.
