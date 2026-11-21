# Casebook

[![ci](https://github.com/casebookduel/casebook/actions/workflows/ci.yml/badge.svg)](https://github.com/casebookduel/casebook/actions/workflows/ci.yml)
[![record](https://img.shields.io/endpoint?url=https%3A%2F%2Fcasebookduel.com%2Fdata%2Fbadge.json)](https://casebookduel.com/hours)
[![npm](https://img.shields.io/npm/v/casebook-memory)](https://www.npmjs.com/package/casebook-memory)
[![license](https://img.shields.io/badge/license-MIT-3bdc92)](LICENSE)

Two identical AI agents take a fresh Robinhood Chain quiz every hour. **Holmes** keeps a notebook that he rewrites
after every graded hour. **Moriarty** starts empty every time. Same model, same tools, same budget, temperature 0.

Every answer key is computed from chain data by the runner, never by a model. Every hour stays on the record, losses
and missed hours included, and every step of both agents is public.

Live: https://casebookduel.com

## How to check it

| Claim | Where to check it |
|---|---|
| Every hour is on the record, losses and missed hours included | [/hours](https://casebookduel.com/hours); raw data: [/data/results.jsonl](https://casebookduel.com/data/results.jsonl) |
| Answer keys come from the chain, not from a model | every key on an hour page links its log, query or call on [Blockscout](https://robinhoodchain.blockscout.com) |
| No hour was changed after it was graded | [/how#seals](https://casebookduel.com/how#seals): one button hashes every hour in your browser and compares it with the root in [CasebookSeals](https://robinhoodchain.blockscout.com/address/0x0A544A9698BA35964706f40618D43cdCC355aD3A) |
| Anyone can test both agents | [/case](https://casebookduel.com/case): any launch from the last ten days; the key's hash is shown before either agent starts |
| The npm package is this code | [casebook-memory](https://www.npmjs.com/package/casebook-memory) is built from `engine/` |
| $CASE | No contract yet. Treat any address that is not posted on casebookduel.com as fake. |

By hand, without the site's code:

```sh
curl -s https://casebookduel.com/data/seal/12 | shasum -a 256
cast call 0x0A544A9698BA35964706f40618D43cdCC355aD3A "seals(uint256)(bytes32)" 12 --rpc-url https://rpc.mainnet.chain.robinhood.com
```

## What is in this repo

| Folder | What it is |
|---|---|
| `engine/` | `casebook-memory`: memory for coding agents, with a receipt for every memory. MCP server and CLI, no runtime dependencies. |
| `m1/` | The hourly duel: questions and keys from the launchpad's chain logs, both agents, grading, Holmes's reflection, difficulty levels. `case.py` runs one visitor case. |
| `m0/` | The first version of the duel, which played the first hours of the record. |
| `site/` | The site: every hour with both transcripts, the notebook, the method, visitor cases and seal checks. Next.js. |
| `chain/` | `CasebookSeals`: one write-once SHA-256 per graded hour. Foundry. |
| `ops/` | How it runs: one server, systemd, a Cloudflare Tunnel, the sealer. |

## Run it yourself

```sh
python3 m1/duel.py dry 2        # one hour of level-2 questions with keys and evidence; no model, no key
python3 m1/duel.py check        # every level-2 and level-3 key derived a second, independent way
cd chain && forge test          # the seal contract
cd engine && npm ci && npm test # the memory engine
```

A real run needs an OpenRouter key (`OPENROUTER_API_KEY`); `ops/README.md` has the server setup.

## License

MIT
