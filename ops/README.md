# Running Casebook 24/7

One small server runs two things:

- **The runner** plays the hourly duel and writes `m1/out/`.
- **The site** runs as `next start` on `localhost:3000` (not 127.0.0.1: on this server localhost is not 127.0.0.1, and behind https the proxy rewrites need localhost) and reads `m1/out/` directly. New hours appear within about 2
  minutes, with no rebuild.

A Cloudflare Tunnel publishes the site on the domain. The server opens no ports, and its IP never appears in DNS.

## Owner steps (accounts and payment)

1. **Domain.** Buy `casebookduel.com` and add it to Cloudflare (free plan): switch the nameservers at the registrar.
2. **Server.** Rent a small Ubuntu 24.04 server (1–2 vCPU, 2 GB RAM, about $5 a month). Keep the IP and root SSH
   access.
3. **Tunnel.** Made through the API with a Cloudflare token limited to this zone (Tunnel Edit; DNS Edit, Zone Read,
   Zone Settings Edit): a remotely managed tunnel `casebook` whose ingress sends `casebookduel.com` and
   `www.casebookduel.com` to `http://localhost:3000`, two proxied CNAMEs to `<tunnel id>.cfargotunnel.com`, and Always
   Use HTTPS on. On the server, `cloudflared-casebook.service` runs the connector as its own user with the token in
   `/etc/cloudflared/token` (mode 600), never on a command line. The server opens no port but SSH.
4. **Model key.** Make an OpenRouter key for this project, with a credit limit.

## Moving the duel from the Mac to the server

Run from the machine that has the project, in its root folder:

```sh
kill $(cat m1/duel.pid)                       # stop the Mac runner first: two runners would both write hours
rsync -az --exclude node_modules --exclude .next site m1 ops root@SERVER:/opt/casebook/
ssh root@SERVER sh /opt/casebook/ops/setup.sh # first run installs Node 22 and Python, and writes the env files
ssh root@SERVER nano /etc/casebook/runner.env # paste the OpenRouter key (never echo it)
ssh root@SERVER sh /opt/casebook/ops/setup.sh # second run builds the site and starts both services
```

Then paste the tunnel install command from step 3 on the server.

## Checks

```sh
curl -sI https://casebookduel.com | head -1                                # 200
curl -s https://casebookduel.com/data/duel.json | head -c 200
ssh root@SERVER journalctl -u casebook-runner -n 20 --no-pager
ssh root@SERVER tail -n 3 /opt/casebook/m1/out/run.log
```

## Day to day

| Task | Command |
|---|---|
| Ship a site change | `rsync -az --exclude node_modules --exclude .next --exclude '.env*' site/ root@SERVER:/opt/casebook/site/`, then on the server `sh /opt/casebook/ops/rebuild-site.sh`: it builds a copy while the old build keeps serving, swaps them, restarts (about a second) and puts the old one back if the new one does not answer. Never build in `/opt/casebook/site` itself, and never restart after a failed build. |
| Raise the spend cap | Edit `DUEL_CAP` in `/etc/casebook/runner.env`, then `systemctl restart casebook-runner`. |
| Stop the duel | `systemctl stop casebook-runner`. The site keeps every hour and shows the duel as paused. |
| Logs | `journalctl -u casebook-site -f` and `tail -f /opt/casebook/m1/out/run.log` |

When the cap is reached, the runner exits cleanly and stays stopped; it is not restarted. A crash restarts it after a
minute.

## Free option for the first days: the Mac

The runner already runs on the Mac. The site can run there too, and the tunnel can come from the Mac:

1. `brew install cloudflared`.
2. In `site/`, run `DUEL_DIR=$PWD/../m1/out npx next build && DUEL_DIR=$PWD/../m1/out npx next start -p 3000 -H 127.0.0.1`.
3. Run the tunnel install command, using the macOS tab in the dashboard.

The catch: when the Mac sleeps, loses its network or reboots, the site goes down and hours are missed.

## Seals (each hour's fingerprint on Robinhood Chain)

The first `setup.sh` run prints the **sealer address**. Its key is made on the server and never leaves it
(`/etc/casebook/seal.env`, mode 600, root only). It can only seal, and it holds only gas money. The sealer runs as its
own user (`casebook-seal`) from a root-owned copy in `/opt/casebook-seal`, so the site's user can neither read the key
nor change the script that holds it.

1. Send about 0.002 ETH on Robinhood Chain to the sealer address. One seal is about 50,000 gas, roughly $0.002 at
   November 2026 gas prices, so that lasts a few months.
2. Deploy the contract (owner says yes first; this is the only on-chain step):
   ```sh
   cd /opt/casebook-seal && set -a && . /etc/casebook/seal.env && set +a && node seal.mjs deploy
   ```
   It prints `SEAL_CONTRACT=0x...`. Add that line to both `/etc/casebook/seal.env` and `/etc/casebook/site.env`.
3. Rebuild with `sh /opt/casebook/ops/rebuild-site.sh` (setup.sh builds too, but it does not restart a running site). The hour pages get the seal row and the check
   button, /how gets its Seals section) and starts `casebook-seal.timer`. The first run seals every earlier hour in
   batches of 40; after that, each hour is sealed a few minutes after it is graded.
4. Verify the source on Sourcify, which serves Robinhood Chain, from any machine with Foundry (no key needed):
   ```sh
   cd chain && forge verify-contract <SEAL_CONTRACT> src/CasebookSeals.sol:CasebookSeals --chain 4663 \
     --verifier sourcify --constructor-args $(cast abi-encode "constructor(address)" <SEALER_ADDRESS>)
   ```

Check it any time: `cd /opt/casebook-seal && SEAL_CONTRACT=0x... node seal.mjs status` lists every closed hour
against the chain and the sealer's balance. `journalctl -u casebook-seal -n 20` shows the last runs; a low balance is
logged as a warning, and an hour whose data changed after sealing is logged as MISMATCH (the hour page's check shows it
too).

## Visitor cases (/case)

Visitors paste a token the launchpad created in the last ten days, pick a question, and watch both agents answer it.
Each case costs about $0.005–0.04 in model calls, so it is off until the owner turns it on.

1. Make a separate OpenRouter key for cases with a small credit limit (for example $20), so cases can never use the
   duel's credit.
2. In `/etc/casebook/site.env` set `CASES_LIVE=1` and `CASE_OPENROUTER_API_KEY=` that key. `CASE_FREE_PER_DAY` (3)
   is per visitor; `CASE_DAILY_USD` (2) is the total for everyone, after which cases close until 00:00 UTC.
3. Rebuild with `sh /opt/casebook/ops/rebuild-site.sh`. The nav, the hero and the footer get the Case link.

Cases are saved in `/opt/casebook/m1/cases/` (one JSON per case, plus `cases.jsonl`, plus `spend.jsonl`, one line per
paid model call, which the daily budget sums). They never touch the hourly record or Holmes's notebook.

Cases share this server's IP, and the public RPC limits requests per IP, so they are kept away from the duel: one case
at a time, at least 15 seconds between starts, at most 12 starts per visitor a day (skips included), and no case from
3 minutes before each hour is due until it should be graded.

## Holder perk (launch day)

Wallets holding `HOLDER_MIN` $CASE or more get `HOLDER_CASES` (20) cases a day after signing one message (no
transaction). Set `HOLDER_MIN` in `/etc/casebook/site.env` before launch; it stays inert until the token address is
set, and `ops/set-ca.sh` rebuilds with both.
