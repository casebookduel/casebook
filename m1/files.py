"""The launch files: every launch on the launchpad gets a file within about a minute, from chain data alone (no model).
It runs beside the duel (systemd casebook-files) and never touches the duel's state; the agents have no way to read it.

Every few seconds it reads the new blocks once: the factory's launch and graduation events, and every buy and sell
event (any address, kept only for curves the factory launched). Per launch it keeps the first buyer that is not the
creator (the exam's rule), the creator's first sell (a sell event with the creator as the caller, whose tokens are
sold, or as the recipient of the proceeds), the counts of buys and sells, and the graduation. A file is the launch
plus its creator's record at the moment it is read (launches in 24 hours, 7 days and 30 days, graduations, how many
earlier launches the creator sold on and how fast) and whether the first buyer is one of the wallets that took the most
first buys in the last 7 days.

   python3 m1/files.py run            the service: fills 30 days of launches (7 of trades) once, then follows the head
   python3 m1/files.py file <token>   one file, as the site gets it

It answers on 127.0.0.1:FILES_PORT (default 7461) for the site's server only: /feed?until=<ts>&before=<ts>&limit=<n>,
/file/<token>, /stats. State: DUEL_DIR/files.db (SQLite)."""
import http.client, json, os, sqlite3, ssl, statistics, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import duel  # noqa: E402

OUT = os.environ.get("DUEL_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
DB = os.path.join(OUT, "files.db")
PORT = int(os.environ.get("FILES_PORT") or 7461)
DAY = 86400
LAUNCH_DAYS, TRADE_DAYS = 30, 7   # what the first start fills in: launches and graduations, and trades
SNIPERS, SNIPER_MIN = 20, 5       # the wallets with the most first buys in 7 days, at least SNIPER_MIN each
STEP, CHUNK = 3.0, 20_000         # seconds between reads of the head; blocks per read while filling in
_TLS = ssl.create_default_context()

def rpc(method, params, deadline=45):
    """One JSON-RPC call with a hard limit on the whole answer: a socket that keeps trickling bytes never stalls the
    loop (urllib's timeout is per read, and one such call held this service for minutes on 27 Nov)."""
    err = ""
    for k in range(4):
        t0 = time.time()
        try:
            c = http.client.HTTPSConnection(duel.RPC_HOST, timeout=15, context=_TLS)
            c.request("POST", "/", json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}),
                      {"content-type": "application/json", "user-agent": duel.UA})
            r, parts = c.getresponse(), []
            while True:
                b = r.read(65536)
                if not b: break
                parts.append(b)
                if time.time() - t0 > deadline: raise TimeoutError(f"{method}: no full answer in {deadline} s")
            c.close()
            return json.loads(b"".join(parts))
        except Exception as e:
            err = str(e)[:200]
            time.sleep(1 + k)
    return {"error": {"message": "network: " + err}}

def call(method, params):
    r = rpc(method, params)
    if "error" in r: raise RuntimeError(f"{method}: {json.dumps(r['error'])[:200]}")
    return r["result"]

addr = lambda topic: "0x" + topic[-40:].lower()
bn = lambda l: int(l["blockNumber"], 16)
order = lambda l: (bn(l), int(l["logIndex"], 16))

_ts = {}
def ts(b):   # a block's timestamp, exact; cached
    if b not in _ts:
        if len(_ts) > 200_000: _ts.clear()
        _ts[b] = int(call("eth_getBlockByNumber", [hex(b), False])["timestamp"], 16)
    return _ts[b]

def block_at(t, lo, hi):   # the first block at or after time t, between lo and hi
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if ts(mid) >= t: hi = mid
        else: lo = mid
    return hi

def glogs(topics, a, b, address=None):   # every log in [a, b] with these topics; halves the span when the RPC refuses it
    out, lo, step = [], a, b - a + 1
    while lo <= b:
        hi = min(b, lo + step - 1)
        q = {"topics": topics, "fromBlock": hex(lo), "toBlock": hex(hi)}
        if address: q["address"] = address
        r = rpc("eth_getLogs", [q])
        if "error" in r:
            if step <= 100: raise RuntimeError(f"getLogs failed: {r['error']}")
            step //= 2
            continue
        out += r["result"]
        lo = hi + 1
    return out

def text_of(token, selector):   # an ERC-20 name() or symbol(): an ABI string, or a bytes32 from older tokens
    try: raw = bytes.fromhex(call("eth_call", [{"to": token, "data": selector}, "latest"])[2:])
    except Exception: return None
    if len(raw) >= 64:
        off = int.from_bytes(raw[:32], "big")
        if off + 32 <= len(raw):
            n = int.from_bytes(raw[off:off + 32], "big"); raw = raw[off + 32: off + 32 + min(n, 200)]
    s = raw.rstrip(b"\0").decode("utf-8", "replace")
    s = "".join(c for c in s if c.isprintable()).strip()
    return s[:40] or None

def db(path=DB):
    con = sqlite3.connect(path, timeout=30, check_same_thread=False)
    con.execute("pragma journal_mode=wal")
    con.executescript("""
      create table if not exists launch (token text primary key, curve text, creator text, block int, ts int, symbol text,
        name text, first_buyer text, first_buy_s int, dev_sell_s int, dev_sells int default 0, buys int default 0,
        sells int default 0, grad_ts int, full int default 0);
      create index if not exists launch_curve on launch(curve);
      create index if not exists launch_creator on launch(creator, ts);
      create index if not exists launch_ts on launch(ts);
      create table if not exists meta (k text primary key, v text);""")
    return con

def ro():   # the API's own read-only connection: readers never take the writer's lock
    return sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=30, check_same_thread=False)

meta = lambda con, k: (con.execute("select v from meta where k=?", (k,)).fetchone() or [None])[0]
setmeta = lambda con, k, v: con.execute("insert or replace into meta values (?, ?)", (k, str(v)))

def step(con, a, b, trades=True, pool=None):
    """Reads blocks a..b once: launches, graduations and, with trades, every buy and sell of a known curve."""
    L = sorted(glogs([duel.T_LAUNCH], a, b, duel.FACTORY), key=order)
    if L and trades:   # exact time, symbol and name
        get = lambda l: (ts(bn(l)), text_of(addr(l["topics"][1]), "0x95d89b41"), text_of(addr(l["topics"][1]), "0x06fdde03"))
        info = list(pool.map(get, L)) if pool else [get(l) for l in L]
    elif L:   # before the trade window only the counts matter: the time between the span's two ends, no names
        ta, tb = ts(a), ts(b)
        info = [(ta + (bn(l) - a) * (tb - ta) // max(1, b - a), None, None) for l in L]
    if L:
        con.executemany("insert or ignore into launch (token, curve, creator, block, ts, symbol, name, full) values (?,?,?,?,?,?,?,?)",
                        [(addr(l["topics"][1]), addr(l["topics"][2]), addr(l["topics"][3]), bn(l), t, s, n, 1 if trades else 0)
                         for l, (t, s, n) in zip(L, info)])
    for g in glogs([duel.T_GRAD], a, b, duel.FACTORY):
        con.execute("update launch set grad_ts=? where token=? and grad_ts is null", (ts(bn(g)), addr(g["topics"][1])))
    if trades:
        for x in sorted(glogs([[duel.T_BUY, duel.T_SELL]], a, b), key=order): trade(con, x)
    con.commit()

def trade(con, x):
    row = con.execute("select token, creator, ts, first_buyer, dev_sell_s from launch where curve=?", (x["address"].lower(),)).fetchone()
    if not row: return
    token, creator, t0, fb, ds = row
    if x["topics"][0] == duel.T_BUY:
        to = addr(x["topics"][2])
        if to != creator and fb is None:
            con.execute("update launch set buys=buys+1, first_buyer=?, first_buy_s=? where token=?", (to, ts(bn(x)) - t0, token))
        else:
            con.execute("update launch set buys=buys+1 where token=?", (token,))
    else:
        if creator in (addr(x["topics"][1]), addr(x["topics"][2])):
            con.execute("update launch set sells=sells+1, dev_sells=dev_sells+1, dev_sell_s=coalesce(dev_sell_s, ?) where token=?", (ts(bn(x)) - t0, token))
        else:
            con.execute("update launch set sells=sells+1 where token=?", (token,))

# ───────── reading: one file, the feed, the day ─────────
_snip = {"at": 0, "map": {}}
def snipers(con, now):   # first buyer -> its rank and count among the busiest first buyers of 7 days; a minute's cache
    if now - _snip["at"] > 60:
        rows = con.execute("select first_buyer, count(*) n from launch where ts > ? and first_buyer is not null group by first_buyer "
                           "having n >= ? order by n desc limit ?", (now - 7 * DAY, SNIPER_MIN, SNIPERS)).fetchall()
        _snip.update(at=now, map={w: {"rank": i + 1, "n": n} for i, (w, n) in enumerate(rows)})
    return _snip["map"]

COLS = "token, curve, creator, block, ts, symbol, name, first_buyer, first_buy_s, dev_sell_s, dev_sells, buys, sells, grad_ts, full"
def as_row(r): return dict(zip([c.strip() for c in COLS.split(",")], r))

def file_of(con, r, now):
    """A launch with its creator's record as of now: counts, graduations, and the creator's earlier launches here."""
    mine = [as_row(x) for x in con.execute(f"select {COLS} from launch where creator=? order by ts", (r["creator"],))]
    earlier = [m for m in mine if m["ts"] < r["ts"] and m["full"]]
    sold = [m["dev_sell_s"] for m in earlier if m["dev_sell_s"] is not None]
    settled = [m for m in earlier if m["ts"] < now - 600]   # ten minutes in, a launch with no outside buyer has had its chance
    sn = snipers(con, now).get(r["first_buyer"]) if r["first_buyer"] else None
    return {**{k: r[k] for k in ("token", "curve", "creator", "block", "ts", "symbol", "name", "first_buyer", "first_buy_s",
                                  "dev_sell_s", "dev_sells", "buys", "sells", "grad_ts")},
            "trades_seen": bool(r["full"]), "first_buyer_sniper": sn,
            "creator_record": {
                "n24": sum(m["ts"] > now - DAY for m in mine), "n7": sum(m["ts"] > now - 7 * DAY for m in mine),
                "n30": sum(m["ts"] > now - 30 * DAY for m in mine), "first_seen": mine[0]["ts"] if mine else r["ts"],
                "grads": sum(m["grad_ts"] is not None for m in mine),
                "earlier": len(earlier), "sold_on": len(sold), "sold_60": sum(s <= 60 for s in sold),
                "sold_median_s": statistics.median(sold) if sold else None,
                "settled": len(settled), "no_buyer": sum(m["first_buyer"] is None for m in settled),
                "recent": [{k: m[k] for k in ("token", "symbol", "ts", "grad_ts", "dev_sell_s", "first_buyer")} for m in mine[-8:][::-1]],
            }}

def feed(con, until, before=None, limit=40):
    rows = con.execute(f"select {COLS} from launch where ts <= ? and ts < ? and full = 1 order by ts desc, block desc limit ?",
                       (until, before or 2 ** 62, max(1, min(limit, 100)))).fetchall()
    now = int(time.time())
    return [file_of(con, as_row(r), now) for r in rows]

def stats(con):
    now = int(time.time())
    n, c = con.execute("select count(*), count(distinct creator) from launch where ts > ?", (now - DAY,)).fetchone()
    rep = con.execute("select count(*) from (select creator from launch where ts > ? group by creator having count(*) >= 2)", (now - DAY,)).fetchone()[0]
    fb = con.execute("select count(*) from launch where ts > ? and first_buyer is not null", (now - DAY,)).fetchone()[0]
    top = sum(x[0] for x in con.execute("select count(*) n from launch where ts > ? and first_buyer is not null group by first_buyer order by n desc limit 8", (now - DAY,)))
    last = int(meta(con, "last") or 0)
    return {"launches_24h": n, "creators_24h": c, "repeat_creators_24h": rep, "first_buys_24h": fb, "top8_first_buys_24h": top,
            "last_block": last, "head": int(meta(con, "head") or last), "last_ts": int(meta(con, "last_ts") or 0),
            "since": int(meta(con, "trades_from_ts") or 0), "now": now}

# ───────── the service ─────────
class API(BaseHTTPRequestHandler):
    con = None
    def log_message(self, *a): pass
    def send(self, code, obj):
        body = json.dumps(obj, separators=(",", ":")).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        num = lambda k, d=None: int(q[k]) if q.get(k, "").isdigit() else d
        con = ro()
        try:
            if u.path == "/feed": return self.send(200, feed(con, num("until", int(time.time())), num("before"), num("limit", 40)))
            if u.path == "/stats": return self.send(200, stats(con))
            if u.path.startswith("/file/"):
                tok = u.path[6:].lower()
                r = con.execute(f"select {COLS} from launch where token=?", (tok,)).fetchone() if len(tok) == 42 else None
                return self.send(200, file_of(con, as_row(r), int(time.time()))) if r else self.send(404, {"error": "unknown"})
            self.send(404, {"error": "path"})
        finally:
            con.close()

def serve():
    ThreadingHTTPServer(("127.0.0.1", PORT), API).serve_forever()

def run():
    """Fills in from LAUNCH_DAYS back (trades from TRADE_DAYS back) in big spans, then follows the head; a restart
    picks up where it stopped. It answers the site from the start; /stats says how far it has come."""
    con = db()
    if meta(con, "trades_from") is None:
        head = int(call("eth_blockNumber", []), 16); now = ts(head)
        a30 = block_at(now - LAUNCH_DAYS * DAY, max(0, head - 40_000_000), head)
        a7 = block_at(now - TRADE_DAYS * DAY, a30, head)
        setmeta(con, "trades_from", a7); setmeta(con, "trades_from_ts", ts(a7)); setmeta(con, "last", a30 - 1); con.commit()
    a7 = int(meta(con, "trades_from"))
    threading.Thread(target=serve, daemon=True).start()
    print(f"answering on 127.0.0.1:{PORT}; trades from block {a7}, read to block {meta(con, 'last')}", flush=True)
    n = 0
    with ThreadPoolExecutor(6) as pool:
        while True:
            try:
                head = int(call("eth_blockNumber", []), 16); last = int(meta(con, "last"))
                setmeta(con, "head", head)
                if head <= last: con.commit(); time.sleep(STEP); continue
                a, b = last + 1, min(head, last + (CHUNK if head - last > 2_000 else 2_000))
                if b < a7: step(con, a, b, trades=False, pool=pool)
                elif a < a7: step(con, a, a7 - 1, trades=False, pool=pool); step(con, a7, b, pool=pool)
                else: step(con, a, b, pool=pool)
                setmeta(con, "last", b); setmeta(con, "last_ts", ts(b)); con.commit()
                n += 1
                if head - b > 2_000 and n % 20 == 0: print(f"  filling in: block {b}, {head - b} behind", flush=True)
                if head - b <= 2_000: time.sleep(STEP)
            except Exception as e:   # a bad read is retried on the next step; the service never stops on one
                print("step failed:", str(e)[:200], flush=True); time.sleep(STEP)

if __name__ == "__main__":
    if sys.argv[1:2] == ["run"]: run()
    elif sys.argv[1:2] == ["file"]:
        con = db(); r = con.execute(f"select {COLS} from launch where token=?", (sys.argv[2].lower(),)).fetchone()
        print(json.dumps(file_of(con, as_row(r), int(time.time())), indent=1) if r else "unknown token")
    else: sys.exit(__doc__)
