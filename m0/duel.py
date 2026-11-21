"""M0 kill test: two identical agents answer fresh Robinhood Chain questions every hour.
Arm A keeps notes between hours (written by its own reflection on graded results); arm B starts empty every hour.
Same model, same tools, same budget, temperature 0, tasks interleaved. Answer keys come from chain data, not a model.

Usage:  python3 duel.py once          one hour, printed summary
        python3 duel.py run [hours]   hourly loop (default 24), stops at the spend cap
        python3 duel.py report        accuracy per arm, paired sign test, cost
Env: OPENROUTER_API_KEY (required), DUEL_MODEL, DUEL_CAP (USD, default 8)."""
import json, math, os, random, re, socket, sys, time, urllib.request
from Crypto.Hash import keccak as _keccak

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)
RPC_HOST = "rpc.mainnet.chain.robinhood.com"
RPC = f"https://{RPC_HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e"
T_LAUNCH = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607"  # topics: token, curve, creator
T_GRAD = "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259"    # topics: token
SEL_TAX = "0xc1bb8901"                                                              # creatorTaxBps() on the curve
MODEL = os.environ.get("DUEL_MODEL", "deepseek/deepseek-v4.1-flash")
CAP_USD = float(os.environ.get("DUEL_CAP", "8"))
MAX_CALLS = 8
BLOCKS_PER_H = 36_000
ALLOWED = {"eth_blockNumber", "eth_getBlockByNumber", "eth_getLogs", "eth_call", "eth_getTransactionByHash",
           "eth_getTransactionReceipt", "eth_getCode", "eth_chainId"}
BASE = f"""You answer questions about Robinhood Chain (chain id 4663, an Arbitrum Orbit L2 making about 9-10 blocks a second) with read-only tools.
Pons is its main token launchpad. The Pons factory contract is {FACTORY}. It creates every Pons token and emits an event when it does, and a different event when a token graduates from its bonding curve. Each token trades on its own bonding-curve contract until it graduates; the curve contract has a function creatorTaxBps().
Tools: rpc (read-only JSON-RPC), keccak (keccak-256 of a text such as a function or event signature), words (split hex data into 32-byte words), answer (your final answer).
You have at most {MAX_CALLS} tool calls in total, and the answer call counts. Give only the value in the answer: an address, a number, or yes/no."""
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


def factory_logs(topics, a, b):
    """every factory log with these topics in [a, b]; halves the range when the RPC refuses it"""
    out, lo, step = [], a, b - a + 1
    while lo <= b:
        hi = min(b, lo + step - 1)
        r = rpc("eth_getLogs", [{"address": FACTORY, "topics": topics, "fromBlock": hex(lo), "toBlock": hex(hi)}])
        if "error" in r:
            if step <= 500: raise RuntimeError(f"getLogs failed: {r['error']}")
            step //= 2
            continue
        out += r["result"]
        lo = hi + 1
    return out


def make_tasks(rng):
    head = int(rpc("eth_blockNumber", [])["result"], 16)
    L = factory_logs([T_LAUNCH], head - BLOCKS_PER_H, head)
    G = factory_logs([T_GRAD], head - 6 * BLOCKS_PER_H, head)
    if len(L) < 6: raise RuntimeError(f"only {len(L)} launches in the last hour")
    ls = [dict(token="0x" + e["topics"][1][-40:], curve="0x" + e["topics"][2][-40:], creator="0x" + e["topics"][3][-40:],
               block=int(e["blockNumber"], 16)) for e in L]
    grads = {"0x" + e["topics"][1][-40:] for e in G}
    p = rng.sample(ls, 4)
    tax = int(rpc("eth_call", [{"to": p[3]["curve"], "data": SEL_TAX}, "latest"])["result"], 16)
    a = head - rng.randint(9_000, 30_000)
    b = a + rng.randint(3_000, 7_000)
    count = sum(1 for e in ls if a <= e["block"] <= b)
    if grads and rng.random() < 0.5:
        g_tok, g_ans = rng.choice(sorted(grads)), "yes"
    else:
        g_tok, g_ans = rng.choice([e["token"] for e in ls if e["token"] not in grads]), "no"
    tasks = [
        dict(kind="creator", q=f"Who created the Pons token {p[0]['token']}? Answer with the creator's address.", a=p[0]["creator"]),
        dict(kind="curve", q=f"What is the address of the bonding-curve contract of the Pons token {p[1]['token']}?", a=p[1]["curve"]),
        dict(kind="launch_block", q=f"In which block number was the Pons token {p[2]['token']} created?", a=str(p[2]["block"])),
        dict(kind="tax", q=f"What creator tax, in basis points, does the Pons token {p[3]['token']} charge on its bonding curve?", a=str(tax)),
        dict(kind="count", q=f"How many Pons tokens were created from block {a} to block {b}, inclusive?", a=str(count)),
        dict(kind="graduated", q=f"As of block {head}, had the Pons token {g_tok} graduated from its bonding curve? Answer yes or no.", a=g_ans),
    ]
    rng.shuffle(tasks)
    return head, tasks


def run_tool(name, args):
    if name == "rpc":
        m, p = args.get("method"), args.get("params") or []
        if m not in ALLOWED: return "error: method not allowed"
        r = rpc(m, p, tries=2)
        if "error" in r: return "error: " + json.dumps(r["error"])[:400]
        res = r.get("result")
        if m == "eth_getLogs" and isinstance(res, list):
            first = [dict(block=int(x["blockNumber"], 16), address=x["address"], topics=x["topics"], data=x["data"][:200]) for x in res[:12]]
            return json.dumps(dict(count=len(res), first=first))
        if m == "eth_getBlockByNumber" and isinstance(res, dict):
            res = {k: res.get(k) for k in ("number", "timestamp", "hash")}
        s = json.dumps(res)
        return s if len(s) <= 3000 else s[:3000] + "...(truncated)"
    if name == "keccak":
        h = _keccak.new(digest_bits=256)
        h.update(str(args.get("text", "")).encode())
        return "0x" + h.hexdigest()
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
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", json.dumps(body).encode(),
                                 {"content-type": "application/json", "user-agent": "duel-m0",
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


def solve(task, notes):
    system = BASE + (f"\n\nYour notes from earlier hours:\n{notes}" if notes else "")
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": task["q"]}]
    trace, calls, ans, nudged = [], 0, None, False
    while ans is None and calls < MAX_CALLS:
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
            if ans is not None or calls >= MAX_CALLS:
                msgs.append({"role": "tool", "tool_call_id": tc["id"], "content": "skipped: tool budget used up"})
                continue
            calls += 1
            if name == "answer":
                ans = str(args.get("value", "")).strip()
                msgs.append({"role": "tool", "tool_call_id": tc["id"], "content": "ok"})
                continue
            out = run_tool(name, args)
            trace.append(dict(tool=name, args=args, out=out[:240]))
            msgs.append({"role": "tool", "tool_call_id": tc["id"], "content": out})
    if ans is None and calls >= MAX_CALLS:   # one last turn to answer, same rule for both arms
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


def hour(i, rng, notes):
    pin_dns()
    head, tasks = make_tasks(rng)
    rows = []
    with open(os.path.join(OUT, "results.jsonl"), "a") as f:
        for t in tasks:
            for arm, n in (("A", notes), ("B", "")):
                res = solve(t, n)
                ok = norm(res["answer"]) == norm(t["a"])
                f.write(json.dumps(dict(hour=i, ts=int(time.time()), head=head, model=MODEL, kind=t["kind"], q=t["q"], truth=t["a"],
                                        arm=arm, answer=res["answer"], ok=ok, calls=res["calls"], trace=res["trace"])) + "\n")
                f.flush()
                if arm == "A": rows.append((t, res))
    new = reflect(notes, rows)
    open(os.path.join(OUT, f"notes_h{i:02d}.md"), "w").write(new)
    open(os.path.join(OUT, "notes_latest.md"), "w").write(new)
    return new


def summary(rows):
    out = {}
    for arm in ("A", "B"):
        r = [x for x in rows if x["arm"] == arm]
        out[arm] = (sum(x["ok"] for x in r), len(r), sum(x["calls"] for x in r) / max(1, len(r)))
    return out


def report():
    rows = [json.loads(l) for l in open(os.path.join(OUT, "results.jsonl"))]
    hours = sorted({r["hour"] for r in rows})
    print(f"model {rows[0]['model']}, {len(hours)} hours, spend ${spent():.3f}")
    print("hour  A ok/n  B ok/n   A calls  B calls")
    for h in hours:
        s = summary([r for r in rows if r["hour"] == h])
        print(f"{h:4}  {s['A'][0]}/{s['A'][1]}     {s['B'][0]}/{s['B'][1]}      {s['A'][2]:.1f}      {s['B'][2]:.1f}")
    s = summary(rows)
    print(f"TOTAL A {s['A'][0]}/{s['A'][1]} ({100*s['A'][0]/max(1,s['A'][1]):.0f}%)  B {s['B'][0]}/{s['B'][1]} ({100*s['B'][0]/max(1,s['B'][1]):.0f}%)  calls A {s['A'][2]:.1f} B {s['B'][2]:.1f}")
    late = [r for r in rows if r["hour"] >= 2]
    if late:
        s2 = summary(late)
        print(f"from hour 2  A {100*s2['A'][0]/max(1,s2['A'][1]):.0f}%  B {100*s2['B'][0]/max(1,s2['B'][1]):.0f}%")
    pairs = {}
    for r in rows: pairs.setdefault((r["hour"], r["q"]), {})[r["arm"]] = r["ok"]
    a_only = sum(1 for p in pairs.values() if p.get("A") and not p.get("B"))
    b_only = sum(1 for p in pairs.values() if p.get("B") and not p.get("A"))
    n = a_only + b_only
    k = max(a_only, b_only)
    pval = min(1.0, 2 * sum(math.comb(n, j) for j in range(k, n + 1)) / 2 ** n) if n else 1.0
    print(f"paired: A right & B wrong {a_only}, B right & A wrong {b_only}, two-sided sign test p = {pval:.4f}")
    for kind in sorted({r["kind"] for r in rows}):
        s = summary([r for r in rows if r["kind"] == kind])
        print(f"  {kind:13} A {s['A'][0]}/{s['A'][1]}  B {s['B'][0]}/{s['B'][1]}")


def main():
    if not os.environ.get("OPENROUTER_API_KEY"): sys.exit("OPENROUTER_API_KEY is not set")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "once"
    if cmd == "report": return report()
    hours = 1 if cmd == "once" else int(sys.argv[2]) if len(sys.argv) > 2 else 24
    rng = random.Random(int(time.time()))
    notes_path = os.path.join(OUT, "notes_latest.md")
    notes = open(notes_path).read() if os.path.exists(notes_path) else ""
    done = len({json.loads(l)["hour"] for l in open(os.path.join(OUT, "results.jsonl"))}) if os.path.exists(os.path.join(OUT, "results.jsonl")) else 0
    for i in range(done, done + hours):
        if spent() >= CAP_USD:
            log(f"spend cap ${CAP_USD} reached (${spent():.3f}); stopping")
            break
        t0 = time.time()
        try:
            notes = hour(i, rng, notes)
            rows = [json.loads(l) for l in open(os.path.join(OUT, "results.jsonl")) if json.loads(l)["hour"] == i]
            s = summary(rows)
            log(f"hour {i}: A {s['A'][0]}/{s['A'][1]} ({s['A'][2]:.1f} calls)  B {s['B'][0]}/{s['B'][1]} ({s['B'][2]:.1f} calls)  spend ${spent():.3f}")
        except Exception as e:
            log(f"hour {i} failed: {str(e)[:300]}")
        if cmd == "run" and i < done + hours - 1:
            time.sleep(max(60, 3600 - (time.time() - t0)))


if __name__ == "__main__":
    main()
