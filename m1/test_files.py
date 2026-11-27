"""files.py on made-up logs: the first buyer skips the creator, a creator's sell counts as the caller or as the
recipient of the proceeds, and the creator's record counts only earlier launches whose trades were seen.
   python3 m1/test_files.py"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import duel, files

pad = lambda a: "0x" + "0" * 24 + a[2:]
T0 = int(time.time()) - 3600
files.ts = lambda b: T0 + b                      # one second a block
files.text_of = lambda token, sel: "SYM" if sel == "0x95d89b41" else "Name"
DEV, A, B, C = "0x" + "d" * 40, "0x" + "a" * 40, "0x" + "b" * 40, "0x" + "c" * 40
def launch(i, block, creator=DEV):
    return {"topics": [duel.T_LAUNCH, pad("0x%040x" % (0x1000 + i)), pad("0x%040x" % (0x2000 + i)), pad(creator)], "blockNumber": hex(block), "logIndex": "0x0", "address": duel.FACTORY}
def tr(kind, i, block, t1, t2, li=1):
    return {"topics": [kind, pad(t1), pad(t2)], "blockNumber": hex(block), "logIndex": hex(li), "address": "0x%040x" % (0x2000 + i)}
LOGS = {duel.T_LAUNCH: [launch(1, 10), launch(2, 100)], duel.T_GRAD: [],
        "trades": [tr(duel.T_BUY, 1, 10, DEV, DEV), tr(duel.T_BUY, 1, 12, A, A), tr(duel.T_BUY, 1, 13, B, B),
                   tr(duel.T_SELL, 1, 40, "0x" + "e" * 40, DEV),   # through a router: the proceeds go to the creator
                   tr(duel.T_SELL, 1, 50, C, C), tr(duel.T_BUY, 2, 101, A, A), tr(duel.T_SELL, 2, 103, DEV, DEV)]}
def fake(topics, a, b, address=None):
    key = topics[0] if isinstance(topics[0], str) else "trades"
    return [l for l in LOGS.get(key, []) if a <= int(l["blockNumber"], 16) <= b]
files.glogs = fake
con = files.db(":memory:")
files.step(con, 0, 200)
r1 = files.as_row(con.execute(f"select {files.COLS} from launch where token=?", ("0x%040x" % 0x1001,)).fetchone())
assert r1["first_buyer"] == A and r1["first_buy_s"] == 2, r1          # the creator's own buy in the launch block is skipped
assert r1["buys"] == 3 and r1["sells"] == 2 and r1["dev_sells"] == 1 and r1["dev_sell_s"] == 30, r1
f2 = files.file_of(con, files.as_row(con.execute(f"select {files.COLS} from launch where token=?", ("0x%040x" % 0x1002,)).fetchone()), T0 + 200)
assert f2["dev_sell_s"] == 3 and f2["first_buyer"] == A, f2           # sold as the caller
cr = f2["creator_record"]
assert cr["n24"] == 2 and cr["earlier"] == 1 and cr["sold_on"] == 1 and cr["sold_median_s"] == 30 and cr["grads"] == 0, cr
assert [x["token"] for x in cr["recent"]] == ["0x%040x" % 0x1002, "0x%040x" % 0x1001]
assert len(files.feed(con, T0 + 200)) == 2 and len(files.feed(con, T0 + 50)) == 1   # the feed stops at "until"
print("files: ok")
