"""The notebook league: notebooks entered by burning $CASE into CasebookLeague, played beside Holmes and Moriarty.

Each Entered event is one notebook. The runner reads new entries at the start of an hour, refuses notebooks that break
the published rules (the lesson rules, with line breaks allowed), and plays up to PLAYING entries at a time, oldest
first, each for HOURS hours: one more arm per entry reads the notebook as its notes, never rewrites it, and answers the
same questions at the same moment as Holmes and Moriarty with the same model, tools and budget. The board compares each
entry with Holmes and Moriarty on exactly the questions it played.

State lives in OUT/league.json; the entries' answers go to OUT/league_results.jsonl, apart from the hourly record.
Env: LEAGUE_CONTRACT (address; unset means no league), LEAGUE_FROM (its deploy block)."""
import json, os
import lessons as LS

HOURS = 24
PLAYING = 3


def entered_topic():
    try: from Crypto.Hash import keccak   # computed, never typed by hand; pycryptodome from pip
    except ImportError: from Cryptodome.Hash import keccak   # the same library as Debian and Ubuntu package it
    return "0x" + keccak.new(digest_bits=256, data=b"Entered(uint256,address,uint256,string)").hexdigest()


def load(out):
    try: return json.load(open(os.path.join(out, "league.json")))
    except Exception: return dict(scanned=int(os.environ.get("LEAGUE_FROM", "0") or 0) - 1, entries=[])


def save(out, st):
    tmp = os.path.join(out, "league.json.tmp")
    with open(tmp, "w") as f: json.dump(st, f, indent=1)
    os.replace(tmp, os.path.join(out, "league.json"))


def scan(st, address, head, get_logs):
    """add the notebooks entered since the last scan; Entered has the same layout as Taught (id, sender, burned, text)"""
    known, topic = {e["id"] for e in st["entries"]}, entered_topic()
    a = st["scanned"] + 1
    while a <= head:
        b = min(head, a + LS.SPAN - 1)
        for log in sorted(get_logs(address, topic, a, b), key=lambda e: (int(e["blockNumber"], 16), int(e["logIndex"], 16))):
            e = LS.decode(log)
            if e["id"] in known: continue
            why = LS.refused(e["text"], lines=True)
            st["entries"].append(dict(id=e["id"], player=e["teacher"], burned=e["burned"], text=e["text"], tx=e["tx"], block=e["block"],
                                      status="filtered" if why else "queued", why=why, hours=[], right=0, holmes=0, moriarty=0, n=0))
            known.add(e["id"])
        st["scanned"] = b
        a = b + 1
    return st


def playing(st):
    """the entries that play this hour: those already playing, topped up to PLAYING with the oldest queued"""
    now = [e for e in st["entries"] if e["status"] == "playing"]
    for e in st["entries"]:
        if len(now) >= PLAYING: break
        if e["status"] == "queued":
            e["status"] = "playing"
            now.append(e)
    return sorted(now, key=lambda e: e["id"])


def record(entry, hour, right, holmes, moriarty, n):
    """one hour of play; after HOURS hours the entry is done and stays on the board"""
    entry["hours"].append(hour)
    entry["right"] += right
    entry["holmes"] += holmes
    entry["moriarty"] += moriarty
    entry["n"] += n
    if len(entry["hours"]) >= HOURS: entry["status"] = "done"
