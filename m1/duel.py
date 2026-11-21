"""M1: the hourly duel, now with difficulty levels.
Two identical agents answer fresh Robinhood Chain questions every hour. Arm A (Holmes) keeps notes written by its own
reflection on graded results; arm B (Moriarty) starts empty every hour. Same model, same tools, same budget,
temperature 0, tasks interleaved. Answer keys come from chain data, never from a model.

Levels: L1 Lookup (6 questions, 8 tool calls each), L2 Trace (8, 12), L3 Investigate (8, 16). From L2 on, 2 of the
hour's 8 questions are retention questions of earlier levels, each with its own level's budget. When Holmes is right on
at least 90% of the current level's own questions over the last 12 hours played at it, the next hour starts the next
level for both arms (L3 is the top for now; no demotion).

Usage:  python3 duel.py dry 1|2|3     build one hour of questions for that level from the chain head and print each
                                      question with its key and evidence (no model call, no API key)
        python3 duel.py check [2|3]   the same for L2 and L3, then re-derive every L2/L3 key a second, independent way
        python3 duel.py once          one hour at the current level (calls the model)
        python3 duel.py run [hours]   hourly loop (default 24), stops at the spend cap (calls the model)
        python3 duel.py report        accuracy per level and arm, paired sign test, retention, cost
        python3 duel.py seed M0_OUT   continue from M0: copy its results, notes and run log into m1/out; the next hour
                                      follows on at L1 (M0 rows read as level 1, no retention, no evidence)
Env: OPENROUTER_API_KEY (once and run only), DUEL_MODEL, DUEL_CAP (USD, default 8)."""
import itertools, json, math, os, random, re, shutil, socket, sys, time, urllib.request
import lessons as LS
import league as LG
from collections import Counter
try: from Crypto.Hash import keccak as _keccak          # pycryptodome from pip
except ImportError: from Cryptodome.Hash import keccak as _keccak   # the same library as Debian and Ubuntu package it

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("DUEL_OUT") or os.path.join(HERE, "out")   # the override is for local tests only
os.makedirs(OUT, exist_ok=True)
RPC_HOST = "rpc.mainnet.chain.robinhood.com"
RPC = f"https://{RPC_HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e"


def kec(text):
    h = _keccak.new(digest_bits=256)
    h.update(text.encode())
    return "0x" + h.hexdigest()


# Topics copied from m0 and the earlier chain tools (their signatures are unknown); `check` confirms each against real logs.
T_LAUNCH = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607"  # factory: token created. topics token, curve, creator; data quote token (0 = ETH), 0, graduation target
T_GRAD = "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259"    # factory: token graduated. topics token
T_BUY = "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455"     # curve: buy. topics caller, recipient of the tokens
T_SELL = "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df"    # curve: sell. topics caller (the tokens come from it), recipient of the proceeds
T_CURVE_GRAD = "0xf8d37a90738ae063b8b8058b66f5880cf3cf7ab0c5d4fa78219696591dfbfb67"  # curve: its own graduation event, often but not always in the factory's graduation tx
T_TRANSFER = kec("Transfer(address,address,uint256)")
SEL_TAX = kec("creatorTaxBps()")[:10]                    # on the curve
SEL_BALANCE = kec("balanceOf(address)")[:10]
SEL_SUPPLY = kec("totalSupply()")[:10]
ZERO = "0x" + "0" * 40
MODEL = os.environ.get("DUEL_MODEL", "deepseek/deepseek-v4.1-flash")
CAP_USD = float(os.environ.get("DUEL_CAP", "8"))
LEVELS = {1: dict(n=6, calls=8), 2: dict(n=8, calls=12), 3: dict(n=8, calls=16)}   # questions an hour, tool calls a question
N_RETENTION = 2              # from L2 on, this many of the hour's questions come from earlier levels
UNLOCK_HOURS, UNLOCK_ACC = 12, 0.9
LOG_SHOW = 30                # a getLogs result shows its count and the first 30 logs (m0: 12); L3 picks queries that fit
BLOCKS_PER_H = 36_000
ALLOWED = {"eth_blockNumber", "eth_getBlockByNumber", "eth_getLogs", "eth_call", "eth_getTransactionByHash",
           "eth_getTransactionReceipt", "eth_getCode", "eth_chainId"}
BASE = f"""You answer questions about Robinhood Chain (chain id 4663, an Arbitrum Orbit L2 making about 9-10 blocks a second) with read-only tools.
The questions are about tokens from the launchpad factory {FACTORY}. It creates every one of these tokens and emits an event when it does, and a different event when a token graduates from its bonding curve. Each token trades on its own bonding-curve contract until it graduates; the curve contract has a function creatorTaxBps(), and it emits an event for every buy and every sell.
Tools: rpc (read-only JSON-RPC), keccak (keccak-256 of a text such as a function or event signature), words (split hex data into 32-byte words), answer (your final answer).
You have at most {{calls}} tool calls in total, and the answer call counts. Give only the value in the answer: an address, a number, or yes/no."""
TOOLS = [
    {"type": "function", "function": {"name": "rpc", "description": "Read-only JSON-RPC call to Robinhood Chain. Methods: " + ", ".join(sorted(ALLOWED)) + ".",
     "parameters": {"type": "object", "properties": {"method": {"type": "string"}, "params": {"type": "array", "items": {}}}, "required": ["method", "params"]}}},
    {"type": "function", "function": {"name": "keccak", "description": "keccak-256 of a UTF-8 text, for example 'transfer(address,uint256)'. Returns 0x hex.",
     "parameters": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}},
    {"type": "function", "function": {"name": "words", "description": "Split 0x hex data into 32-byte words, each shown as hex, integer and address.",
     "parameters": {"type": "object", "properties": {"hex": {"type": "string"}}, "required": ["hex"]}}},
    {"type": "function", "function": {"name": "answer", "description": "Your final answer: only the value (an address, a number or yes/no).",
     "parameters": {"type": "object", "properties": {"value": {"type": "string"}}, "required": ["value"]}}},
]


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    with open(os.path.join(OUT, "run.log"), "a") as f: f.write(line + "\n")


def pin_dns():
    """Resolve the RPC host over DNS-over-HTTPS (some networks hijack plain DNS for it); fall back to system DNS."""
    try:
        q = urllib.request.Request(f"https://1.1.1.1/dns-query?name={RPC_HOST}&type=A", headers={"accept": "application/dns-json"})
        ips = [a["data"] for a in json.load(urllib.request.urlopen(q, timeout=15)).get("Answer", []) if a.get("type") == 1]
    except Exception:
        ips = []
    if ips:
        orig = getattr(socket, "_duel_orig", socket.getaddrinfo)
        socket._duel_orig = orig
        socket.getaddrinfo = lambda host, *a, **k: orig(ips[0] if host == RPC_HOST else host, *a, **k)


def rpc(method, params, tries=5):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    err = ""
    for k in range(tries):
        try:
            req = urllib.request.Request(RPC, body, {"content-type": "application/json", "user-agent": UA})
            return json.load(urllib.request.urlopen(req, timeout=60))
        except Exception as e:
            err = str(e)[:200]
            time.sleep(2 * (k + 1))
    return {"error": {"message": "network: " + err}}


def call(method, params):
    r = rpc(method, params)
    if "error" in r: raise RuntimeError(f"{method}: {json.dumps(r['error'])[:200]}")
    return r["result"]


def logs(topics, a, b, address=FACTORY):
    """every log of address (one or a list) with these topics in [a, b]; halves the range when the RPC refuses it"""
    out, lo, step = [], a, b - a + 1
    while lo <= b:
        hi = min(b, lo + step - 1)
        r = rpc("eth_getLogs", [{"address": address, "topics": topics, "fromBlock": hex(lo), "toBlock": hex(hi)}])
        if "error" in r:
            if step <= 500: raise RuntimeError(f"getLogs failed: {r['error']}")
            step //= 2
            continue
        out += r["result"]
        lo = hi + 1
    return out


# ---------- questions ----------

class Skip(Exception):
    """the chain data cannot give this kind a clean key this hour"""


def a1(e): return "0x" + e["topics"][1][-40:]
def a2(e): return "0x" + e["topics"][2][-40:]
def bn(e): return int(e["blockNumber"], 16)
def pad(a): return "0x" + a[2:].lower().rjust(64, "0")


def ref(e, what):
    return dict(what=what, tx=e["transactionHash"], logIndex=int(e["logIndex"], 16), block=bn(e), address=e["address"].lower(), topic0=e["topics"][0])


def qry(what, address, topics, a, b, n, **more):
    return dict(what=what, getLogs=dict(address=address, topics=topics, fromBlock=a, toBlock=b), count=n, **more)


def pick(rng, cands, good):
    """a random candidate, from the good ones 3 times in 4, so keys vary (mostly not 0, mostly not the creator)"""
    g = [x for x in cands if good(x)]
    return rng.choice(g if g and rng.random() < 0.75 else cands)


def context(rng):
    head = int(call("eth_blockNumber", []), 16)
    L = logs([T_LAUNCH], head - BLOCKS_PER_H, head)
    G = logs([T_GRAD], head - 6 * BLOCKS_PER_H, head)
    if len(L) < 6: raise RuntimeError(f"only {len(L)} launches in the last hour")
    ls = [dict(token=a1(e), curve=a2(e), creator="0x" + e["topics"][3][-40:], block=bn(e), log=e) for e in L]
    return dict(head=head, rng=rng, ls=ls, grads={a1(e): e for e in G})


def by_address(es):
    out = {}
    for e in sorted(es, key=lambda e: (bn(e), int(e["logIndex"], 16))): out.setdefault(e["address"].lower(), []).append(e)
    return out


def trades(c):
    """Buy and Sell logs of every curve launched in the last hour, up to the head, by curve, oldest first (fetched once)"""
    if "trades" not in c:
        c["trades"] = by_address(logs([[T_BUY, T_SELL]], min(l["block"] for l in c["ls"]), c["head"], [l["curve"] for l in c["ls"]]))
    return c["trades"]


def xfers(c):
    """Transfer logs of every token launched in the last hour, up to the head, by token, oldest first (fetched once)"""
    if "xfers" not in c:
        c["xfers"] = by_address(logs([T_TRANSFER], min(l["block"] for l in c["ls"]), c["head"], [l["token"] for l in c["ls"]]))
    return c["xfers"]


def buys(c, l, a=0, b=None):
    b = c["head"] if b is None else b
    return [e for e in trades(c).get(l["curve"], []) if e["topics"][0] == T_BUY and a <= bn(e) <= b]


def live(c):
    """last-hour launches that have not graduated, with 1 to LOG_SHOW buys: every L3 query on them fits one getLogs page"""
    return [l for l in c["ls"] if l["token"] not in c["grads"] and 1 <= len(buys(c, l)) <= LOG_SHOW]


L1_KINDS = ["creator", "curve", "launch_block", "tax", "count", "graduated"]


def l1(c, kinds=L1_KINDS):
    """m0's six lookups with m0's selection logic; new are the wording (no launchpad name) and the evidence"""
    head, ls, grads, rng = c["head"], c["ls"], c["grads"], c["rng"]
    p = rng.sample(ls, 4)
    a = head - rng.randint(9_000, 30_000)
    b = a + rng.randint(3_000, 7_000)
    count = sum(1 for e in ls if a <= e["block"] <= b)
    if grads and rng.random() < 0.5:
        g_tok, g_ans = rng.choice(sorted(grads)), "yes"
    else:
        g_tok, g_ans = rng.choice([e["token"] for e in ls if e["token"] not in grads]), "no"
    g_ev = ref(grads[g_tok], "graduation event") if g_ans == "yes" else \
        qry("graduation events of this token (it launched inside this range)", FACTORY, [T_GRAD, pad(g_tok)], head - 6 * BLOCKS_PER_H, head, 0)
    tax = dict(kind="tax", q=f"What creator tax, in basis points, does the token {p[3]['token']} from the launchpad factory {FACTORY} charge on its bonding curve?",
               evidence=[ref(p[3]["log"], "launch event (curve)"), dict(what="creatorTaxBps() on the curve", eth_call=dict(to=p[3]["curve"], data=SEL_TAX), block=head)])
    if "tax" in kinds:
        tax["a"] = str(int(call("eth_call", [{"to": p[3]["curve"], "data": SEL_TAX}, hex(head)]), 16))
    tasks = [
        dict(kind="creator", q=f"Who created the token {p[0]['token']} from the launchpad factory {FACTORY}? Answer with the creator's address.", a=p[0]["creator"], evidence=[ref(p[0]["log"], "launch event (topic 3)")]),
        dict(kind="curve", q=f"What is the address of the bonding-curve contract of the token {p[1]['token']} from the launchpad factory {FACTORY}?", a=p[1]["curve"], evidence=[ref(p[1]["log"], "launch event (topic 2)")]),
        dict(kind="launch_block", q=f"In which block number did the launchpad factory {FACTORY} create the token {p[2]['token']}?", a=str(p[2]["block"]), evidence=[ref(p[2]["log"], "launch event")]),
        tax,
        dict(kind="count", q=f"How many tokens did the launchpad factory {FACTORY} create from block {a} to block {b}, inclusive?", a=str(count), evidence=[qry("launch events in the range", FACTORY, [T_LAUNCH], a, b, count)]),
        dict(kind="graduated", q=f"As of block {head}, had the token {g_tok} from the launchpad factory {FACTORY} graduated from its bonding curve? Answer yes or no.", a=g_ans, evidence=[g_ev]),
    ]
    return [t for t in tasks if t["kind"] in kinds]


# L2 Trace: two or three hops each

def first_buyer(c):
    cands = []
    for l in c["ls"]:
        e = next((e for e in buys(c, l) if a2(e) != l["creator"]), None)
        # a recipient that passes the tokens on in the same tx is a router: "who got the tokens" would be ambiguous
        if e and not any(x["transactionHash"] == e["transactionHash"] and a1(x) == a2(e) for x in xfers(c).get(l["token"], [])):
            cands.append((l, e))
    if not cands: raise Skip("no launch of the last hour has a clean first buy by someone other than its creator")
    l, e = c["rng"].choice(cands)
    return dict(kind="first_buyer", q=f"Not counting the token's creator, which address received tokens in the first buy on the bonding curve of the token {l['token']} from the launchpad factory {FACTORY}?",
                a=a2(e), evidence=[ref(l["log"], "launch event (creator, curve)"), ref(e, "first buy on the curve whose recipient (topic 2) is not the creator")], x=dict(l=l))


def buys_100(c):
    n = lambda l: len(buys(c, l, l["block"], l["block"] + 100))
    cands = [l for l in c["ls"] if l["block"] + 100 <= c["head"]]
    if not cands: raise Skip("no launch is 100 blocks old yet")
    l = pick(c["rng"], cands, lambda l: n(l) >= 2)
    k = n(l)
    return dict(kind="buys_100", q=f"How many buys did the bonding curve of the token {l['token']} from the launchpad factory {FACTORY} record from the token's launch block through 100 blocks later, inclusive?",
                a=str(k), evidence=[ref(l["log"], "launch event (curve, launch block)"), qry("buy events on the curve", l["curve"], [T_BUY], l["block"], l["block"] + 100, k)], x=dict(l=l))


def creator_sold(c):
    B, yes, no = c["head"], [], []
    for l in c["ls"]:
        out = [x for x in xfers(c).get(l["token"], []) if a1(x) == l["creator"]]
        direct = [x for x in out if a2(x) == l["curve"]]
        if direct: yes.append((l, direct))
        elif not out: no.append((l, []))   # a creator who moved tokens elsewhere (maybe a sale through a router) is ambiguous
    if not yes and not no: raise Skip("every creator moved tokens only to addresses other than the curve")
    l, d = c["rng"].choice(yes if yes and (not no or c["rng"].random() < 0.5) else no)
    ev = [ref(l["log"], "launch event (creator, curve)"), qry("token Transfers from the creator to the curve", l["token"], [T_TRANSFER, pad(l["creator"]), pad(l["curve"])], l["block"], B, len(d))]
    if d: ev.append(ref(d[0], "first such Transfer"))
    return dict(kind="creator_sold", q=f"Up to block {B}, did the creator of the token {l['token']} from the launchpad factory {FACTORY} sell any of it from the creator's own address, sending tokens straight to the token's bonding curve? Answer yes or no.",
                a="yes" if d else "no", evidence=ev, x=dict(l=l, B=B))


def creator_launches(c):
    A, B = c["head"] - BLOCKS_PER_H, c["head"]
    n = Counter(l["creator"] for l in c["ls"])
    l = pick(c["rng"], c["ls"], lambda l: n[l["creator"]] >= 2)
    k = n[l["creator"]]
    return dict(kind="creator_launches", q=f"How many tokens did the launchpad factory {FACTORY} create from block {A} to block {B}, inclusive, for the creator of the token {l['token']}?",
                a=str(k), evidence=[ref(l["log"], "launch event (creator)"), qry("launch events with this creator (topic 3)", FACTORY, [T_LAUNCH, None, None, pad(l["creator"])], A, B, k)], x=dict(l=l, A=A, B=B))


def sells_1000(c):
    # a count of Sell events: unambiguous although most sells come through routers (then the router is the seller topic)
    W = 1000
    n = lambda l: sum(1 for e in trades(c).get(l["curve"], []) if e["topics"][0] == T_SELL and bn(e) <= l["block"] + W)
    cands = [l for l in c["ls"] if l["block"] + W <= c["head"]]
    if not cands: raise Skip("no launch is 1000 blocks old yet")
    l = pick(c["rng"], cands, lambda l: n(l) >= 1)
    k = n(l)
    return dict(kind="sells_1000", q=f"How many sells did the bonding curve of the token {l['token']} from the launchpad factory {FACTORY} record from the token's launch block through {W} blocks later, inclusive?",
                a=str(k), evidence=[ref(l["log"], "launch event (curve, launch block)"), qry("sell events on the curve", l["curve"], [T_SELL], l["block"], l["block"] + W, k)], x=dict(l=l, W=W))


def grad_blocks(c):
    head, rng = c["head"], c["rng"]
    G = logs([T_GRAD], head - 7 * 24 * BLOCKS_PER_H, head)
    for g in rng.sample(G, min(6, len(G))):
        L = logs([T_LAUNCH, g["topics"][1]], max(1, head - 9_000_000), bn(g))   # inside one 10M getLogs span from the head
        # the curve's own graduation event is sometimes 1-100 blocks before the factory's; keep tokens where both share a tx,
        # so "the graduation block" is one block whichever event an agent reads
        if L and any(e["transactionHash"] == g["transactionHash"] for e in logs([T_CURVE_GRAD], bn(g), bn(g), a2(L[0]))):
            return dict(kind="grad_blocks", q=f"The token {a1(g)} from the launchpad factory {FACTORY} has graduated from its bonding curve. How many blocks after its launch did it graduate (the block of the factory's graduation event minus the block of the factory's launch event)?",
                        a=str(bn(g) - bn(L[0])), evidence=[ref(L[0], "launch event"), ref(g, "graduation event")], x=dict(l=dict(token=a1(g), curve=a2(L[0])), g=g))
    raise Skip("no sampled graduation of the last 7 days has its launch inside the last 9,000,000 blocks and one graduation tx")


# L3 Investigate: aggregation over many logs

def snipers(c):
    W = 20
    bl = lambda l: buys(c, l, l["block"], l["block"] + W)
    cands = [l for l in c["ls"] if l["block"] + W <= c["head"] and len(bl(l)) <= LOG_SHOW]
    if not cands: raise Skip("no launch is 20 blocks old yet")
    l = pick(c["rng"], cands, lambda l: len({a2(e) for e in bl(l)}) >= 2)
    who = sorted({a2(e) for e in bl(l)})
    return dict(kind="snipers", q=f"How many distinct addresses received tokens from the bonding curve of the token {l['token']} from the launchpad factory {FACTORY} in buys made from its launch block through {W} blocks later, inclusive?",
                a=str(len(who)), evidence=[ref(l["log"], "launch event (curve, launch block)"), qry("buy events on the curve; distinct recipients (topic 2)", l["curve"], [T_BUY], l["block"], l["block"] + W, len(bl(l)), recipients=who)], x=dict(l=l, W=W))


def most_buyers(c):
    head, rng, W = c["head"], c["rng"], 300
    ls = sorted(c["ls"], key=lambda l: (l["block"], int(l["log"]["logIndex"], 16)))
    for _ in range(60):
        k = rng.choice((3, 4))
        i = rng.randrange(len(ls) - k + 1)
        grp, rest = ls[i:i + k], ls[:i] + ls[i + k:]
        A, B = grp[0]["block"], grp[-1]["block"]
        if any(A <= l["block"] <= B for l in rest): continue                       # the range must hold exactly these launches
        if any(l["block"] + W > head or l["token"] in c["grads"] for l in grp): continue
        bl = {l["token"]: buys(c, l, l["block"], l["block"] + W) for l in grp}
        if any(len(v) > LOG_SHOW for v in bl.values()): continue
        n = {t: len({a2(e) for e in v}) for t, v in bl.items()}
        top = sorted(n.values(), reverse=True)
        if top[0] < 2 or top[0] == top[1]: continue
        return dict(kind="most_buyers", q=f"Of the tokens the launchpad factory {FACTORY} created from block {A} to block {B}, inclusive, which one had the most distinct buyers from its launch block through {W} blocks later? A buyer is an address that received tokens from the token's bonding curve in a buy. Answer with the token address.",
                    a=max(n, key=n.get), evidence=[qry("launch events in the range", FACTORY, [T_LAUNCH], A, B, k)] +
                    [qry(f"buys of {l['token']}: {n[l['token']]} distinct recipients (topic 2)", l["curve"], [T_BUY], l["block"], l["block"] + W, len(bl[l["token"]])) for l in grp], x=dict(grp=grp, W=W))
    raise Skip("no run of 3-4 consecutive launches with countable buys and a single leader")


def top_holder(c):
    B, cands = c["head"], []
    for l in c["ls"]:
        tl = xfers(c).get(l["token"], [])
        if l["token"] in c["grads"] or len(tl) > LOG_SHOW: continue
        bal = {}
        for x in tl:
            v = int(x["data"], 16)
            bal[a1(x)] = bal.get(a1(x), 0) - v
            bal[a2(x)] = bal.get(a2(x), 0) + v
        h = sorted(((v, a) for a, v in bal.items() if v > 0 and a not in (l["curve"], ZERO)), reverse=True)
        if h and (len(h) == 1 or h[0][0] >= 1.5 * h[1][0]): cands.append((l, h[:2], len(tl), bal))   # a clear leader, no near tie
    if not cands: raise Skip("no quiet token with a clear top holder")
    l, h, n, bal = pick(c["rng"], cands, lambda x: x[1][0][1] != x[0]["creator"])
    return dict(kind="top_holder", q=f"Not counting its bonding-curve contract, which address held the most of the token {l['token']} from the launchpad factory {FACTORY} at block {B}?",
                a=h[0][1], evidence=[ref(l["log"], "launch event (curve)"), qry("the token's Transfer events; balance = received minus sent", l["token"], [T_TRANSFER], l["block"], B, n, top=[[a, str(v)] for v, a in h])],
                x=dict(l=l, B=B, h=h, bal=bal))


def both_buyers(c):
    pairs = list(itertools.combinations(live(c), 2))
    if not pairs: raise Skip("fewer than two quiet, ungraduated launches with buys")
    s = lambda l: {a2(e) for e in buys(c, l)}
    p, q = pick(c["rng"], pairs, lambda pq: s(pq[0]) & s(pq[1]))
    B, both = c["head"], sorted(s(p) & s(q))
    return dict(kind="both_buyers", q=f"How many addresses received tokens from the bonding curves of both the token {p['token']} and the token {q['token']} (both from the launchpad factory {FACTORY}) in buys up to block {B}?",
                a=str(len(both)), evidence=[qry("buys of the first token", p["curve"], [T_BUY], p["block"], B, len(buys(c, p))), qry("buys of the second token", q["curve"], [T_BUY], q["block"], B, len(buys(c, q))),
                                            dict(what="recipients (topic 2) in both", addresses=both)], x=dict(pq=(p, q), B=B))


def repeat_buyers(c):
    cands = live(c)
    if not cands: raise Skip("no quiet, ungraduated launch with buys")
    rep = lambda l: sorted(a for a, m in Counter(a2(e) for e in buys(c, l)).items() if m >= 2)
    l = pick(c["rng"], cands, rep)
    B = c["head"]
    return dict(kind="repeat_buyers", q=f"How many addresses received tokens from the bonding curve of the token {l['token']} from the launchpad factory {FACTORY} in two or more separate buys up to block {B}?",
                a=str(len(rep(l))), evidence=[ref(l["log"], "launch event (curve)"), qry("buy events on the curve; recipients (topic 2) seen twice or more", l["curve"], [T_BUY], l["block"], B, len(buys(c, l)), addresses=rep(l))], x=dict(l=l, B=B))


KINDS = {1: L1_KINDS,
         2: ["first_buyer", "buys_100", "sells_1000", "creator_sold", "creator_launches", "grad_blocks"],
         3: ["snipers", "most_buyers", "top_holder", "both_buyers", "repeat_buyers"]}
BUILD = {k: (lambda c, k=k: l1(c, [k])[0]) for k in L1_KINDS}
BUILD.update({k: globals()[k] for k in KINDS[2] + KINDS[3]})


def make_hour(rng, level):
    """one hour of questions at this level: (context, tasks, skipped kinds with the reason)"""
    c = context(rng)
    tasks, skipped, bad = [], [], set()

    def add(kind, lvl, retention):
        try: t = BUILD[kind](c)
        except Skip as e:
            skipped.append(f"{kind}: {e}")
            bad.add(kind)
            return False
        if t["q"] in {x["q"] for x in tasks}: return False   # the same question twice
        tasks.append(dict(t, level=lvl, retention=retention, calls=LEVELS[lvl]["calls"]))
        return True

    if level == 1:
        tasks = [dict(t, level=1, retention=False, calls=LEVELS[1]["calls"]) for t in l1(c)]
    else:
        for lvl in ((1, 1) if level == 2 else (1, 2)):           # retention: two questions of earlier levels
            for k in rng.sample(KINDS[lvl], len(KINDS[lvl])):
                if k not in {t["kind"] for t in tasks} and add(k, lvl, True): break
        kinds = rng.sample(KINDS[level], len(KINDS[level]))
        for k in itertools.islice(itertools.cycle(kinds), 3 * len(kinds)):
            if sum(not t["retention"] for t in tasks) >= LEVELS[level]["n"] - N_RETENTION: break
            if k not in bad: add(k, level, False)
    rng.shuffle(tasks)
    return c, tasks, skipped


def verify(c, t):
    """the key re-derived a second, independent way: the token's own Transfers instead of the curve's Buy and Sell
    events, the curve's Sell events instead of Transfers, a server-side topic filter instead of a client-side count,
    balanceOf and totalSupply instead of summed Transfers"""
    k, x, head = t["kind"], t["x"], c["head"]
    sent = lambda l, a, b: logs([T_TRANSFER, pad(l["curve"])], a, b, l["token"])   # tokens leaving the curve: one per buy
    try:
        if k == "first_buyer":
            l = x["l"]
            return next((a2(e) for e in sent(l, l["block"], head) if a2(e) != l["creator"]), "none")
        if k == "buys_100":
            l = x["l"]
            return str(len(sent(l, l["block"], l["block"] + 100)))
        if k == "creator_sold":
            l = x["l"]
            return "yes" if logs([T_SELL, pad(l["creator"])], l["block"], x["B"], l["curve"]) else "no"   # sells the creator called
        if k == "creator_launches":
            l = x["l"]
            return str(len(logs([T_LAUNCH, None, None, pad(l["creator"])], x["A"], x["B"])))
        if k == "sells_1000":
            l = x["l"]
            into = logs([T_TRANSFER, None, pad(l["curve"])], l["block"], l["block"] + x["W"], l["token"])
            return str(sum(1 for e in into if a1(e) != ZERO))   # one Transfer into the curve per sell; the launch mint comes from 0x0
        if k == "grad_blocks":
            l, g = x["l"], x["g"]
            mint = logs([T_TRANSFER, pad(ZERO)], max(1, head - 9_000_000), head, l["token"])[0]   # the supply minted at launch
            cg = logs([T_CURVE_GRAD], bn(mint), head, l["curve"])
            if not cg or cg[0]["transactionHash"] != g["transactionHash"]: return "the curve's graduation event is not in the factory's graduation tx"
            return str(bn(cg[0]) - bn(mint))
        if k == "snipers":
            l = x["l"]
            return str(len({a2(e) for e in sent(l, l["block"], l["block"] + x["W"])}))
        if k == "most_buyers":
            n = {l["token"]: len({a2(e) for e in sent(l, l["block"], l["block"] + x["W"])}) for l in x["grp"]}
            top = sorted(n.values(), reverse=True)
            return "tie" if top[0] == top[1] else max(n, key=n.get)
        if k == "top_holder":
            l, B = x["l"], hex(x["B"])
            q = lambda data: int(call("eth_call", [{"to": l["token"], "data": data}, B]), 16)
            for v, a in x["h"] + [(x["bal"].get(l["curve"], 0), l["curve"])]:
                if q(SEL_BALANCE + pad(a)[2:]) != v: return f"balanceOf({a}) differs from its Transfer sum"
            if q(SEL_SUPPLY) != sum(v for a, v in x["bal"].items() if a != ZERO): return "totalSupply differs from the Transfer sums"
            return x["h"][0][1]
        if k == "both_buyers":
            p, q = x["pq"]
            s = lambda l: {a2(e) for e in sent(l, l["block"], x["B"])}
            return str(len(s(p) & s(q)))
        if k == "repeat_buyers":
            l = x["l"]
            return str(sum(1 for m in Counter(a2(e) for e in sent(l, l["block"], x["B"])).values() if m >= 2))
    except Exception as e:
        return f"error: {str(e)[:150]}"
    return "no check for this kind"


def confirm_topics(c):
    """the copied topics against this hour's real logs: every Buy has a Transfer curve -> topic-2 address in its tx,
    every Sell a Transfer topic-1 address -> curve, every launch the token's mint to the curve (topic 2) in its tx"""
    moves = set()
    for xs in xfers(c).values():
        moves |= {(x["transactionHash"], x["address"].lower(), a1(x), a2(x)) for x in xs}
    tok = {l["curve"]: l["token"] for l in c["ls"]}
    n = Counter()
    for curve, es in trades(c).items():
        for e in es:
            side = "buy" if e["topics"][0] == T_BUY else "sell"
            frm, to = (curve, a2(e)) if side == "buy" else (a1(e), curve)
            n[side] += 1
            n[side + " ok"] += (e["transactionHash"], tok[curve], frm, to) in moves
    for l in c["ls"]:
        m = (xfers(c).get(l["token"]) or [None])[0]
        n["launch"] += 1
        n["launch ok"] += bool(m) and a1(m) == ZERO and a2(m) == l["curve"] and m["transactionHash"] == l["log"]["transactionHash"]
    print(f"topics vs real logs: buys {n['buy ok']}/{n['buy']}, sells {n['sell ok']}/{n['sell']}, launches {n['launch ok']}/{n['launch']}; "
          f"Transfer {T_TRANSFER[:10]}, creatorTaxBps {SEL_TAX}, balanceOf {SEL_BALANCE}, totalSupply {SEL_SUPPLY} from keccak")
    return n["buy ok"] == n["buy"] and n["sell ok"] == n["sell"] and n["launch ok"] == n["launch"]


def dry(level, check=False):
    """one hour of questions at this level, printed with keys and evidence; with check, every L2/L3 key is re-derived"""
    c, tasks, skipped = make_hour(random.Random(int(time.time())), level)
    print(f"\n=== L{level} hour from head {c['head']}: {len(tasks)} questions" + (f"; skipped: {'; '.join(skipped)}" if skipped else ""))
    good = confirm_topics(c) if check else True
    ok = n = 0
    for i, t in enumerate(tasks, 1):
        print(f"\n{i}. [L{t['level']} {t['kind']}{', retention' if t['retention'] else ''}; {t['calls']} calls] {t['q']}\n   key: {t['a']}\n   evidence: {json.dumps(t['evidence'])}")
        if check and t["level"] > 1:
            got = verify(c, t)
            n, ok = n + 1, ok + (got == t["a"])
            print(f"   check: {'OK' if got == t['a'] else 'MISMATCH'} (second way: {got})")
    if check: print(f"\nL{level}: {ok}/{n} L2/L3 keys confirmed a second way; topics {'confirmed' if good else 'NOT confirmed'}")
    return ok == n and good


def selftest():
    """the unlock rule on made-up rows"""
    row = lambda h, ok, lvl=1, ret=False, arm="A": dict(hour=h, ok=ok, level=lvl, retention=ret, arm=arm)
    st = dict(level=1, since_hour=0, history=[dict(level=1, from_hour=0)])
    assert unlock(st, 10, [row(h, True) for h in range(11)])["level"] == 1                      # 11 hours: too few
    hours = [row(h, j < 9) for h in range(12) for j in range(10)]                                  # 90% over 12 hours
    up = unlock(st, 11, hours + [row(5, False, ret=True)] * 50 + [row(5, False, arm="B")] * 50)    # retention and Moriarty ignored
    assert up == dict(level=2, since_hour=12, history=[dict(level=1, from_hour=0), dict(level=2, from_hour=12)])
    assert unlock(st, 11, hours + [row(11, False)])["level"] == 1                                 # just under 90%
    assert unlock(dict(level=3, since_hour=0, history=[]), 11, [row(h, True, 3) for h in range(12)])["level"] == 3   # top level
    print("unlock rule self-test: ok")


# ---------- the duel ----------

def run_tool(name, args):
    if name == "rpc":
        m, p = args.get("method"), args.get("params") or []
        if m not in ALLOWED: return "error: method not allowed"
        r = rpc(m, p, tries=2)
        if "error" in r: return "error: " + json.dumps(r["error"])[:400]
        res = r.get("result")
        if m == "eth_getLogs" and isinstance(res, list):
            first = [dict(block=int(x["blockNumber"], 16), address=x["address"], topics=x["topics"], data=x["data"][:200], tx=x["transactionHash"]) for x in res[:LOG_SHOW]]
            return json.dumps(dict(count=len(res), first=first))
        if m == "eth_getBlockByNumber" and isinstance(res, dict):
            res = {k: res.get(k) for k in ("number", "timestamp", "hash")}
        s = json.dumps(res)
        return s if len(s) <= 3000 else s[:3000] + "...(truncated)"
    if name == "keccak":
        return kec(str(args.get("text", "")))
    if name == "words":
        hx = str(args.get("hex", ""))
        hx = hx[2:] if hx.startswith("0x") else hx
        out = []
        for i in range(0, min(len(hx), 64 * 12), 64):
            w = hx[i:i + 64]
            if len(w) < 64: break
            out.append(dict(i=i // 64, hex="0x" + w, int=str(int(w, 16)), address="0x" + w[-40:]))
        return json.dumps(out)
    return "error: unknown tool"


def spent():
    try: return json.load(open(os.path.join(OUT, "spend.json")))["usd"]
    except Exception: return 0.0


def add_spend(usd):
    total = spent() + usd
    json.dump(dict(usd=total), open(os.path.join(OUT, "spend.json"), "w"))
    return total


def chat(messages, tools=None, **extra):
    body = {"model": MODEL, "messages": messages, "temperature": 0, "max_tokens": 1200, "usage": {"include": True}, **extra}
    if tools: body["tools"] = tools
    req = urllib.request.Request(os.environ.get("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions"), json.dumps(body).encode(),   # the override is for local tests only
                                 {"content-type": "application/json", "user-agent": "duel-m1",
                                  "authorization": "Bearer " + os.environ["OPENROUTER_API_KEY"]})
    err = ""
    for k in range(4):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=180))
            if "error" in r: raise RuntimeError(str(r["error"])[:300])
            add_spend(float((r.get("usage") or {}).get("cost") or 0))
            return r
        except Exception as e:
            err = str(e)[:300]
            time.sleep(6 * (k + 1))
    raise RuntimeError("openrouter: " + err)


def solve(task, notes, on_step=None):
    """one agent on one question; on_step(step, calls) after each tool call lets a caller stream the work (cases)"""
    budget = task["calls"]
    system = BASE.format(calls=budget) + (f"\n\nYour notes from earlier hours:\n{notes}" if notes else "")
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": task["q"]}]
    trace, calls, ans, nudged = [], 0, None, False
    while ans is None and calls < budget:
        m = chat(msgs, TOOLS)["choices"][0]["message"]
        msgs.append({k: v for k, v in m.items() if k in ("role", "content", "tool_calls") and v is not None})
        tcs = m.get("tool_calls") or []
        if not tcs:
            if nudged:
                ans = (m.get("content") or "").strip() or None
                break
            nudged = True
            msgs.append({"role": "user", "content": "Use the answer tool for your final answer."})
            continue
        for tc in tcs:   # every tool call gets a reply, or the next request is invalid
            name = tc["function"]["name"]
            try: args = json.loads(tc["function"].get("arguments") or "{}")
            except Exception: args = {}
            if ans is not None or calls >= budget:
                msgs.append({"role": "tool", "tool_call_id": tc["id"], "content": "skipped: tool budget used up"})
                continue
            calls += 1
            if name == "answer":
                ans = str(args.get("value", "")).strip()
                msgs.append({"role": "tool", "tool_call_id": tc["id"], "content": "ok"})
                continue
            out = run_tool(name, args)
            trace.append(dict(tool=name, args=args, out=out[:240]))
            if on_step: on_step(trace[-1], calls)
            msgs.append({"role": "tool", "tool_call_id": tc["id"], "content": out})
    if ans is None and calls >= budget:   # one last turn to answer, same rule for both arms
        msgs.append({"role": "user", "content": "Your tool budget is used up. Give your final answer now with the answer tool."})
        m = chat(msgs, TOOLS)["choices"][0]["message"]
        for tc in m.get("tool_calls") or []:
            if tc["function"]["name"] == "answer":
                try: ans = str(json.loads(tc["function"].get("arguments") or "{}").get("value", "")).strip()
                except Exception: pass
                break
        if ans is None: ans = (m.get("content") or "").strip() or None
    return dict(answer=ans, calls=calls, trace=trace)


def norm(x):
    x = (x or "").strip().lower().strip("\"'` .")
    m = re.search(r"0x[0-9a-f]{40}", x)
    if m: return m.group(0)
    m = re.fullmatch(r"(yes|no)\b.*", x)
    if m: return m.group(1)
    m = re.search(r"\d[\d,_]*", x)
    return str(int(re.sub(r"[,_]", "", m.group(0)))) if m else x


def reflect(notes, rows):
    parts = []
    for t, res in rows:
        ok = norm(res["answer"]) == norm(t["a"])
        steps = "; ".join(f"{s['tool']}({json.dumps(s['args'])[:200]}) -> {s['out'][:420]}" for s in res["trace"])
        parts.append(f"Q: {t['q']}\nYour answer: {res['answer']} | correct answer: {t['a']} | {'RIGHT' if ok else 'WRONG'} | tool calls used: {res['calls']}\nYour steps: {steps}")
    prompt = (f"Your notes so far:\n{notes or '(none yet)'}\n\nThis hour's questions, your answers and the correct answers:\n\n" + "\n\n".join(parts) +
              "\n\nRewrite your notes for the next hour. The tokens and blocks will be different next hour, so keep only general facts and short "
              "procedures that this hour's results confirm and that would let you answer these kinds of questions correctly in fewer tool calls: "
              "contract addresses, event topics and which topic holds what, function selectors, block-range tips, mistakes to avoid. "
              "Drop anything that turned out wrong. Record an event topic or selector only if it appeared in a real tool result "
              "(for example topics[0] of a log you received) or a call with it returned data; never record a hash you computed "
              "for a guessed signature that matched nothing. At most 250 words. Output only the notes.")
    m = chat([{"role": "user", "content": prompt}], max_tokens=1500, reasoning={"enabled": False})["choices"][0]["message"]
    return (m.get("content") or "").strip() or notes   # an empty reply keeps the old notes


def put(name, text):
    """write OUT/name by rename, so a reader never sees it half-written"""
    tmp = os.path.join(OUT, name + ".tmp")
    with open(tmp, "w") as f: f.write(text)
    os.replace(tmp, os.path.join(OUT, name))


def lesson_setup(head):
    """this hour's lessons: (state, the lesson under test or None, the Taught block Holmes reads); never fails the hour"""
    address = os.environ.get("LESSONS_CONTRACT", "")
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", address): return None, None, ""
    try:
        st = LS.scan(LS.load(OUT), address, head, lambda addr, topic, a, b: logs([topic], a, b, address=addr))
        lesson = LS.under_test(st)
        LS.save(OUT, st)
        return st, lesson, LS.taught_block(st)
    except Exception as e:
        log(f"lessons skipped this hour: {str(e)[:200]}")
        return None, None, ""


def league_setup(head):
    """this hour's league: (state, the entries playing); never fails the hour"""
    address = os.environ.get("LEAGUE_CONTRACT", "")
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", address): return None, []
    try:
        st = LG.scan(LG.load(OUT), address, head, lambda addr, topic, a, b: logs([topic], a, b, address=addr))
        entries = LG.playing(st)
        LG.save(OUT, st)
        return st, entries
    except Exception as e:
        log(f"league skipped this hour: {str(e)[:200]}")
        return None, []


def hour(i, rng, notes, level):
    pin_dns()
    c, tasks, skipped = make_hour(rng, level)
    for s in skipped: log(f"hour {i}: skipped {s}")
    # Holmes reads his own notes, then the Taught lessons; his reflection rewrites only his own notes. A lesson under
    # test runs as a third arm on the same questions, written apart from the record (see lessons.py).
    st, lesson, taught = lesson_setup(c["head"])
    lg, entries = league_setup(c["head"])   # league entries play each question right after Holmes and Moriarty
    ids = list(st["taught"]) if st else []
    rows, with_ok, b_ok, played = [], 0, 0, {e["id"]: 0 for e in entries}
    with open(os.path.join(OUT, "results.jsonl"), "a") as f, open(os.path.join(OUT, "lessons_results.jsonl"), "a") as g, \
         open(os.path.join(OUT, "league_results.jsonl"), "a") as k:
        for t in tasks:
            for arm, n in (("A", notes + taught), ("B", "")):
                res = solve(t, n)
                ok = norm(res["answer"]) == norm(t["a"])
                if arm == "B": b_ok += ok
                f.write(json.dumps(dict(hour=i, ts=int(time.time()), head=c["head"], model=MODEL, kind=t["kind"], q=t["q"], truth=t["a"], arm=arm,
                                        answer=res["answer"], ok=ok, calls=res["calls"], trace=res["trace"],
                                        level=t["level"], evidence=t["evidence"], retention=t["retention"],
                                        **(dict(taught=ids) if arm == "A" and ids else {}))) + "\n")
                f.flush()
                if arm == "A": rows.append((t, res))
            if lesson:
                res = solve(t, notes + taught + f"\n\nA lesson to try this hour:\n- {lesson['text']}")
                ok = norm(res["answer"]) == norm(t["a"])
                with_ok += ok
                g.write(json.dumps(dict(hour=i, ts=int(time.time()), lesson=lesson["id"], kind=t["kind"], q=t["q"], truth=t["a"],
                                        answer=res["answer"], ok=ok, calls=res["calls"], trace=res["trace"])) + "\n")
                g.flush()
            for e in entries:
                res = solve(t, e["text"])
                ok = norm(res["answer"]) == norm(t["a"])
                played[e["id"]] += ok
                k.write(json.dumps(dict(hour=i, ts=int(time.time()), entry=e["id"], kind=t["kind"], q=t["q"], truth=t["a"],
                                        answer=res["answer"], ok=ok, calls=res["calls"], trace=res["trace"])) + "\n")
                k.flush()
    if lesson and rows:
        without = sum(norm(res["answer"]) == norm(t["a"]) for t, res in rows)
        LS.record(st, lesson, i, with_ok, without, len(rows))
        LS.save(OUT, st)
        log(f"lesson #{lesson['id']}: with it {with_ok}/{len(rows)}, Holmes {without}/{len(rows)}"
            + (f"; {lesson['status']} after {lesson['with_ok']} against {lesson['without_ok']}" if lesson["status"] != "testing" else ""))
    if entries and rows:
        a_ok = sum(norm(res["answer"]) == norm(t["a"]) for t, res in rows)
        for e in entries: LG.record(e, i, played[e["id"]], a_ok, b_ok, len(rows))
        LG.save(OUT, lg)
        log("league: " + ", ".join(f"#{e['id']} {played[e['id']]}/{len(rows)}" for e in entries) + f" (Holmes {a_ok}, Moriarty {b_ok})")
    if not rows: return notes
    new = reflect(notes, rows)
    put(f"notes_h{i:02d}.md", new)
    put("notes_latest.md", new)
    return new


def load_level():
    try: return json.load(open(os.path.join(OUT, "level.json")))
    except Exception: return dict(level=1, since_hour=0, history=[dict(level=1, from_hour=0)])


def load_rows():
    """results.jsonl rows; seeded M0 rows have no level, retention or evidence, so they read as level 1"""
    path = os.path.join(OUT, "results.jsonl")
    rows = [json.loads(l) for l in open(path)] if os.path.exists(path) else []
    for r in rows:
        r.setdefault("level", 1)
        r.setdefault("retention", False)
        r.setdefault("evidence", "")
    return rows


def next_hour(rows):
    return max(r["hour"] for r in rows) + 1 if rows else 0   # the hour count, unless a failed hour left a gap


def seed(src):
    """continue from M0: copy its results, notes and run log into m1/out; the next hour follows on, at level 1"""
    if not os.path.exists(os.path.join(src, "results.jsonl")): sys.exit(f"no results.jsonl in {src}")
    if os.path.exists(os.path.join(OUT, "results.jsonl")): sys.exit("m1/out already has results; seed only into an empty out")
    for f in ["results.jsonl", "notes_latest.md", "run.log"] + [f for f in os.listdir(src) if re.fullmatch(r"notes_h\d+\.md", f)]:
        if os.path.exists(os.path.join(src, f)): shutil.copy2(os.path.join(src, f), os.path.join(OUT, f))
    rows = load_rows()
    i = next_hour(rows)
    put("level.json", json.dumps(dict(level=1, since_hour=i, history=[dict(level=1, from_hour=i)])))
    log(f"seeded from M0: {len({r['hour'] for r in rows})} hours copied; the next hour is {i}, at L1")


def unlock(st, i, rows):
    """after hour i: Holmes right on at least UNLOCK_ACC of the current level's own (not retention) questions over the
    last UNLOCK_HOURS hours played at that level starts the next level at hour i + 1, for both arms; no demotion"""
    lvl = st["level"]
    mine = [r for r in rows if r["arm"] == "A" and r["level"] == lvl and not r["retention"]]
    hours = sorted({r["hour"] for r in mine})[-UNLOCK_HOURS:]
    last = [r for r in mine if r["hour"] in hours]
    if lvl < max(LEVELS) and len(hours) == UNLOCK_HOURS and sum(r["ok"] for r in last) >= UNLOCK_ACC * len(last):
        return dict(level=lvl + 1, since_hour=i + 1, history=st["history"] + [dict(level=lvl + 1, from_hour=i + 1)])
    return st


def summary(rows):
    out = {}
    for arm in ("A", "B"):
        r = [x for x in rows if x["arm"] == arm]
        out[arm] = (sum(x["ok"] for x in r), len(r), sum(x["calls"] for x in r) / max(1, len(r)))
    return out


def sign_test(rows):
    pairs = {}
    for r in rows: pairs.setdefault((r["hour"], r["q"]), {})[r["arm"]] = r["ok"]
    a_only = sum(1 for p in pairs.values() if p.get("A") and not p.get("B"))
    b_only = sum(1 for p in pairs.values() if p.get("B") and not p.get("A"))
    n, k = a_only + b_only, max(a_only, b_only)
    pval = min(1.0, 2 * sum(math.comb(n, j) for j in range(k, n + 1)) / 2 ** n) if n else 1.0
    return a_only, b_only, pval


def report():
    rows = load_rows()
    if not rows: sys.exit("no results yet")
    st = load_level()
    print(f"model {rows[-1]['model']}, {len({r['hour'] for r in rows})} hours, spend ${spent():.3f}, now L{st['level']} since hour {st['since_hour']}")
    print("hour  level  A ok/n  B ok/n   A calls  B calls")
    for h in sorted({r["hour"] for r in rows}):
        hr = [r for r in rows if r["hour"] == h]
        s = summary(hr)
        print(f"{h:4}  L{max(r['level'] for r in hr)}     {s['A'][0]}/{s['A'][1]}     {s['B'][0]}/{s['B'][1]}      {s['A'][2]:.1f}      {s['B'][2]:.1f}"
              + ("   (M0)" if all(r["evidence"] == "" for r in hr) else ""))
    pct = lambda x: f"{x[0]}/{x[1]} ({100 * x[0] / max(1, x[1]):.0f}%)"
    for lvl in sorted({r["level"] for r in rows}):
        for ret in (False, True):
            part = [r for r in rows if r["level"] == lvl and r["retention"] == ret]
            if not part: continue
            s, (a_only, b_only, pval) = summary(part), sign_test(part)
            print(f"L{lvl}{' retention' if ret else ''}: A {pct(s['A'])}  B {pct(s['B'])}  calls A {s['A'][2]:.1f} B {s['B'][2]:.1f}  "
                  f"paired: A only {a_only}, B only {b_only}, two-sided sign test p = {pval:.4f}")
            for kind in sorted({r["kind"] for r in part}):
                s = summary([r for r in part if r["kind"] == kind])
                print(f"    {kind:16} A {s['A'][0]}/{s['A'][1]}  B {s['B'][0]}/{s['B'][1]}")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "once"
    if cmd == "report": return report()
    if cmd == "seed" and len(sys.argv) > 2: return seed(sys.argv[2])
    if cmd == "dry" and len(sys.argv) > 2 and sys.argv[2] in ("1", "2", "3"):
        pin_dns()
        return dry(int(sys.argv[2]))
    if cmd == "check":
        selftest()
        pin_dns()
        sys.exit(0 if all([dry(lvl, check=True) for lvl in ([int(sys.argv[2])] if len(sys.argv) > 2 else [2, 3])]) else 1)
    if cmd not in ("once", "run"): sys.exit(__doc__)
    if not os.environ.get("OPENROUTER_API_KEY"): sys.exit("OPENROUTER_API_KEY is not set")
    hours = 1 if cmd == "once" else int(sys.argv[2]) if len(sys.argv) > 2 else 24
    rng = random.Random(int(time.time()))
    notes_path = os.path.join(OUT, "notes_latest.md")
    notes = open(notes_path).read() if os.path.exists(notes_path) else ""
    done = next_hour(load_rows())
    for i in range(done, done + hours):
        if spent() >= CAP_USD:
            log(f"spend cap ${CAP_USD} reached (${spent():.3f}); stopping")
            break
        t0, st = time.time(), load_level()
        try:
            notes = hour(i, rng, notes, st["level"])
            rows = load_rows()
            s = summary([r for r in rows if r["hour"] == i])
            new = unlock(st, i, rows)
            put("level.json", json.dumps(new))
            log(f"hour {i} L{st['level']}: A {s['A'][0]}/{s['A'][1]} ({s['A'][2]:.1f} calls)  B {s['B'][0]}/{s['B'][1]} ({s['B'][2]:.1f} calls)  spend ${spent():.3f}"
                + (f"; L{new['level']} unlocked from hour {i + 1}" if new["level"] != st["level"] else ""))
        except Exception as e:
            log(f"hour {i} failed: {str(e)[:300]}")
        if cmd == "run" and i < done + hours - 1:
            time.sleep(max(60, 3600 - (time.time() - t0)))


if __name__ == "__main__":
    main()
