"""A visitor's case: one token from the launchpad factory and one question about it. Holmes, with his notebook as it
stands now, and Moriarty, with nothing, answer it side by side with the hourly duel's own prompt, tools, budget and
model (duel.py). The key comes from the chain and is fixed before either agent starts: its SHA-256 is printed first and
the key itself last. Each case is saved; cases never touch the hourly record or Holmes's notebook.

Usage:  python3 case.py <token> <kind>       prints one JSON object per line as the case runs (env OPENROUTER_API_KEY)
        python3 case.py key <token> <kind>   only the question, the key and its evidence (no model call)
        python3 case.py kinds                the kinds a case can ask
Env: CASE_DIR (default m1/cases), DUEL_DIR (where Holmes's notes_latest.md is; default m1/out), DUEL_MODEL.
Exit codes: 0 done, 2 no clean question for this token (nothing was spent), 1 failure."""
import hashlib, json, os, secrets, sys, threading, time
import duel as D
from duel import BURN, FACTORY, T_LAUNCH, T_GRAD, T_BUY, T_SELL, T_CURVE_GRAD, T_TRANSFER, SEL_TAX, LOG_SHOW, LEVELS, Skip, a1, a2, bn, pad, ref, qry, logs, call

CASE_DIR = os.environ.get("CASE_DIR") or os.path.join(D.HERE, "cases")
NOTES = os.path.join(os.environ.get("DUEL_DIR") or D.OUT, "notes_latest.md")
SPAN = 9_000_000          # one getLogs span back from the head: launches of about the last 10 days
FIRST = 5_000             # first_buyer looks for the first outside buy within this many blocks of the launch
DAY = 24 * D.BLOCKS_PER_H
KINDS = ["creator", "launch_block", "tax", "graduated", "first_buyer", "buys_100", "sells_1000", "creator_sold", "creator_launches", "grad_blocks", "snipers"]
LEVEL = dict(creator=1, launch_block=1, tax=1, graduated=1, first_buyer=2, buys_100=2, sells_1000=2, creator_sold=2, creator_launches=2, grad_blocks=2, snipers=3)


def launch_of(token, head):
    L = logs([T_LAUNCH, pad(token)], max(1, head - SPAN), head)
    if not L: raise Skip("the launchpad factory did not create this token in the last 9,000,000 blocks (about 10 days)")
    e = L[0]
    return dict(token=a1(e), curve=a2(e), creator="0x" + e["topics"][3][-40:], block=bn(e), log=e)


def build(kind, token):
    """the question (worded exactly as the hourly duel words it), its key, its evidence, and a second-way check"""
    head = int(call("eth_blockNumber", []), 16)
    l = launch_of(token, head)
    tok, cur, cre, b = l["token"], l["curve"], l["creator"], l["block"]
    t, x = None, dict(l=l)
    if kind == "creator":
        t = dict(q=f"Who created the token {tok} from the launchpad factory {FACTORY}? Answer with the creator's address.", a=cre, evidence=[ref(l["log"], "launch event (topic 3)")])
    elif kind == "launch_block":
        t = dict(q=f"In which block number did the launchpad factory {FACTORY} create the token {tok}?", a=str(b), evidence=[ref(l["log"], "launch event")])
    elif kind == "tax":
        try: tax = str(int(call("eth_call", [{"to": cur, "data": SEL_TAX}, hex(head)]), 16))
        except Exception: raise Skip("its curve did not answer creatorTaxBps()")
        t = dict(q=f"What creator tax, in basis points, does the token {tok} from the launchpad factory {FACTORY} charge on its bonding curve?", a=tax,
                 evidence=[ref(l["log"], "launch event (curve)"), dict(what="creatorTaxBps() on the curve", eth_call=dict(to=cur, data=SEL_TAX), block=head)])
    elif kind == "graduated":
        G = logs([T_GRAD, pad(tok)], b, head)
        t = dict(q=f"As of block {head}, had the token {tok} from the launchpad factory {FACTORY} graduated from its bonding curve? Answer yes or no.", a="yes" if G else "no",
                 evidence=[ref(G[0], "graduation event")] if G else [qry("graduation events of this token since its launch", FACTORY, [T_GRAD, pad(tok)], b, head, 0)])
    elif kind == "first_buyer":
        e = next((e for e in logs([T_BUY], b, min(head, b + FIRST), cur) if a2(e) != cre), None)
        if not e: raise Skip(f"nobody but its creator bought in its first {FIRST:,} blocks")
        if any(y["transactionHash"] == e["transactionHash"] and a1(y) == a2(e) for y in logs([T_TRANSFER], bn(e), bn(e), tok)):
            raise Skip("its first buy went to a router that passed the tokens on, so who received them has no single answer")
        t = dict(q=f"Not counting the token's creator, which address received tokens in the first buy on the bonding curve of the token {tok} from the launchpad factory {FACTORY}?",
                 a=a2(e), evidence=[ref(l["log"], "launch event (creator, curve)"), ref(e, "first buy on the curve whose recipient (topic 2) is not the creator")])
        head = min(head, b + FIRST)   # the second-way check reads the same window
    elif kind in ("buys_100", "sells_1000", "snipers"):
        W, topic = dict(buys_100=(100, T_BUY), sells_1000=(1000, T_SELL), snipers=(20, T_BUY))[kind]
        if b + W > head: raise Skip(f"it is not {W} blocks old yet")
        es = logs([topic], b, b + W, cur)
        if kind == "buys_100":
            t = dict(q=f"How many buys did the bonding curve of the token {tok} from the launchpad factory {FACTORY} record from the token's launch block through 100 blocks later, inclusive?",
                     a=str(len(es)), evidence=[ref(l["log"], "launch event (curve, launch block)"), qry("buy events on the curve", cur, [T_BUY], b, b + 100, len(es))])
        elif kind == "sells_1000":
            t = dict(q=f"How many sells did the bonding curve of the token {tok} from the launchpad factory {FACTORY} record from the token's launch block through {W} blocks later, inclusive?",
                     a=str(len(es)), evidence=[ref(l["log"], "launch event (curve, launch block)"), qry("sell events on the curve", cur, [T_SELL], b, b + W, len(es))])
        else:
            if len(es) > LOG_SHOW: raise Skip(f"it had {len(es)} buys in its first 20 blocks, more than one page of logs, so the count would test paging, not reading")
            who = sorted({a2(e) for e in es})
            t = dict(q=f"How many distinct addresses received tokens from the bonding curve of the token {tok} from the launchpad factory {FACTORY} in buys made from its launch block through {W} blocks later, inclusive?",
                     a=str(len(who)), evidence=[ref(l["log"], "launch event (curve, launch block)"), qry("buy events on the curve; distinct recipients (topic 2)", cur, [T_BUY], b, b + W, len(es), recipients=who)])
        x["W"] = W
    elif kind == "creator_sold":
        out = logs([T_TRANSFER, pad(cre)], b, head, tok)
        direct = [y for y in out if a2(y) == cur]
        burned = [y for y in out if a2(y) in BURN]
        if not direct and len(burned) < len(out): raise Skip("its creator moved tokens to other addresses (maybe a sale through a router), so yes or no would be ambiguous")
        ev = [ref(l["log"], "launch event (creator, curve)"), qry("token Transfers from the creator to the curve", tok, [T_TRANSFER, pad(cre), pad(cur)], b, head, len(direct))]
        if burned and not direct: ev.append(ref(burned[0], "the creator's burn: a Transfer to the burn address, not a sale"))
        t = dict(q=f"Up to block {head}, did the creator of the token {tok} from the launchpad factory {FACTORY} sell any of it from the creator's own address, sending tokens straight to the token's bonding curve? Answer yes or no.",
                 a="yes" if direct else "no", evidence=ev + ([ref(direct[0], "first such Transfer")] if direct else []))
        x["B"] = head
    elif kind == "creator_launches":
        A = head - DAY
        k = len(logs([T_LAUNCH, None, None, pad(cre)], A, head))
        t = dict(q=f"How many tokens did the launchpad factory {FACTORY} create from block {A} to block {head}, inclusive, for the creator of the token {tok}?",
                 a=str(k), evidence=[ref(l["log"], "launch event (creator)"), qry("launch events with this creator (topic 3)", FACTORY, [T_LAUNCH, None, None, pad(cre)], A, head, k)])
        x.update(A=A, B=head)
    elif kind == "grad_blocks":
        G = logs([T_GRAD, pad(tok)], b, head)
        if not G: raise Skip("it has not graduated")
        g = G[0]
        if not any(e["transactionHash"] == g["transactionHash"] for e in logs([T_CURVE_GRAD], bn(g), bn(g), cur)):
            raise Skip("its curve's own graduation event is not in the factory's graduation tx, so its graduation block would be ambiguous")
        t = dict(q=f"The token {tok} from the launchpad factory {FACTORY} has graduated from its bonding curve. How many blocks after its launch did it graduate (the block of the factory's graduation event minus the block of the factory's launch event)?",
                 a=str(bn(g) - b), evidence=[ref(l["log"], "launch event"), ref(g, "graduation event")])
        x["g"] = g
    else:
        raise ValueError(f"unknown kind {kind}")
    lvl = LEVEL[kind]
    t.update(kind=kind, level=lvl, calls=LEVELS[lvl]["calls"], token=tok, head=head)
    # the hourly duel's independent second derivation, for the kinds it has one (L2 and L3)
    check = D.verify(dict(head=head), dict(kind=kind, x=x)) if lvl > 1 else None
    if check is not None and check != t["a"]: raise Skip(f"two independent readings of the chain disagree ({t['a']} and {check}), so this question has no clean key for this token")
    t["checked"] = check is not None
    return t


def main():
    args = sys.argv[1:]
    if args == ["kinds"]: return print(json.dumps(KINDS))
    only_key = args[:1] == ["key"]
    if only_key: args = args[1:]
    if len(args) != 2 or args[1] not in KINDS or not (args[0].startswith("0x") and len(args[0]) == 42 and all(ch in "0123456789abcdefABCDEF" for ch in args[0][2:])):
        sys.exit(__doc__)
    token, kind = args[0].lower(), args[1]
    os.makedirs(os.path.join(CASE_DIR, "cases"), exist_ok=True)
    D.OUT = CASE_DIR                      # run.log and spend.json for cases live apart from the duel's
    lock, cost = threading.Lock(), [0.0]
    add = D.add_spend

    def add_spend(usd):                   # both arms run at once: keep the running total exact
        with lock:
            cost[0] += usd
            # one ledger line per paid call, so the site's daily budget counts a case even if it is killed halfway
            with open(os.path.join(CASE_DIR, "spend.jsonl"), "a") as f: f.write(json.dumps(dict(ts=int(time.time()), usd=usd)) + "\n")
            return add(usd)
    D.add_spend = add_spend

    def emit(**o):
        with lock:
            sys.stdout.write(json.dumps(o) + "\n")
            sys.stdout.flush()

    D.pin_dns()
    try:
        t = build(kind, token)
    except Skip as e:
        emit(t="skip", why=str(e))
        sys.exit(2)
    except Exception as e:
        emit(t="error", why=str(e)[:300])
        sys.exit(1)
    if only_key: return print(json.dumps(t, indent=1))
    if not os.environ.get("OPENROUTER_API_KEY"): emit(t="error", why="no model key"); sys.exit(1)

    salt = secrets.token_hex(8)
    commit = hashlib.sha256(f"{t['a']}|{salt}".encode()).hexdigest()
    notes = open(NOTES).read() if os.path.exists(NOTES) else ""
    emit(t="task", kind=kind, q=t["q"], level=t["level"], calls=t["calls"], token=t["token"], model=D.MODEL, commit=commit,
         notes=dict(chars=len(notes), sha256=hashlib.sha256(notes.encode()).hexdigest()))
    res = {}

    def arm(name, n):
        try:
            r = D.solve(t, n, on_step=lambda s, calls: emit(t="step", arm=name, n=calls, tool=s["tool"], args=s["args"], out=s["out"]))
        except Exception as e:
            r = dict(answer=None, calls=0, trace=[], error=str(e)[:200])
        r["ok"] = D.norm(r["answer"]) == D.norm(t["a"])
        res[name] = r
        emit(t="answer", arm=name, answer=r["answer"], calls=r["calls"])

    th = [threading.Thread(target=arm, args=a) for a in (("A", notes), ("B", ""))]
    for x in th: x.start()
    for x in th: x.join()

    cid = f"{int(time.time()):x}{secrets.token_hex(3)}"
    emit(t="key", a=t["a"], salt=salt, evidence=t["evidence"], checked=t["checked"])
    rec = dict(id=cid, ts=int(time.time()), token=t["token"], kind=kind, level=t["level"], calls=t["calls"], q=t["q"], head=t["head"], model=D.MODEL,
               truth=t["a"], evidence=t["evidence"], checked=t["checked"], commit=commit, salt=salt,
               notes=dict(chars=len(notes), sha256=hashlib.sha256(notes.encode()).hexdigest()),
               holmes={k: res["A"].get(k) for k in ("answer", "ok", "calls", "trace")},
               moriarty={k: res["B"].get(k) for k in ("answer", "ok", "calls", "trace")}, cost=round(cost[0], 6))
    tmp = os.path.join(CASE_DIR, "cases", cid + ".json.tmp")
    with open(tmp, "w") as f: json.dump(rec, f)
    os.replace(tmp, os.path.join(CASE_DIR, "cases", cid + ".json"))
    with open(os.path.join(CASE_DIR, "cases.jsonl"), "a") as f:
        f.write(json.dumps(dict(id=cid, ts=rec["ts"], token=rec["token"], kind=kind, level=t["level"], h=res["A"]["ok"], m=res["B"]["ok"],
                                hc=res["A"]["calls"], mc=res["B"]["calls"], cost=rec["cost"])) + "\n")
    emit(t="done", id=cid, holmes=dict(ok=res["A"]["ok"], answer=res["A"]["answer"], calls=res["A"]["calls"]),
         moriarty=dict(ok=res["B"]["ok"], answer=res["B"]["answer"], calls=res["B"]["calls"]), cost=rec["cost"])


if __name__ == "__main__":
    main()
