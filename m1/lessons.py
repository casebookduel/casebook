"""Teach Holmes: lessons burned into CasebookLessons, tested in public, kept only if they raise his score.

Each Taught event on the lessons contract is one lesson. The runner reads new events at the start of an hour, refuses
lessons that break the published rules (links, handles, anything but plain printable ASCII), and tests one lesson at a
time: for TEST_HOURS hours a third arm, Holmes with his notes plus the lesson, answers the same questions at the same
moment as Holmes. The lesson is kept if that arm got more questions right than Holmes over those hours; a kept lesson
joins the Taught section that Holmes reads after his own notes every hour (the newest KEEP_MAX). Moriarty never reads it.

State lives in OUT/lessons.json; the third arm's answers go to OUT/lessons_results.jsonl, so the hourly record and its
seals stay exactly as they were. Lesson texts are on chain, so what Holmes read can be checked against the events.
Env: LESSONS_CONTRACT (address; unset means no lessons), LESSONS_FROM (its deploy block)."""
import json, os, re

TEST_HOURS = 2
KEEP_MAX = 10
SPAN = 9_000_000          # one getLogs request covers at most this many blocks (the RPC allows 10,000,000)


def taught_topic():
    try: from Crypto.Hash import keccak   # computed, never typed by hand; pycryptodome from pip
    except ImportError: from Cryptodome.Hash import keccak   # the same library as Debian and Ubuntu package it
    return "0x" + keccak.new(digest_bits=256, data=b"Taught(uint256,address,uint256,string)").hexdigest()


def refused(text, lines=False):
    """why a lesson is not tested (empty, ascii, link, handle), or None; the same rules as the page (site lessonRules.ts).
    lines=True lets a league notebook span lines."""
    if not text.strip(): return "empty"
    if any(not (32 <= ord(ch) < 127 or (lines and ch == "\n")) for ch in text): return "ascii"
    if re.search(r"https?:|://|www\.|t\.me/|discord\.gg|\.(com|io|xyz|org|net|app)\b", text, re.I): return "link"
    if "@" in text: return "handle"
    return None


def decode(log):
    """a Taught log as a lesson: id and teacher from the topics, burned amount and text from the data"""
    data = bytes.fromhex(log["data"][2:])
    burned = int.from_bytes(data[0:32], "big")
    off = int.from_bytes(data[32:64], "big")
    n = int.from_bytes(data[off:off + 32], "big")
    text = data[off + 32:off + 32 + n].decode("utf-8", errors="replace")
    return dict(id=int(log["topics"][1], 16), teacher="0x" + log["topics"][2][-40:], burned=str(burned), text=text,
                tx=log["transactionHash"], block=int(log["blockNumber"], 16))


def load(out):
    try: return json.load(open(os.path.join(out, "lessons.json")))
    except Exception: return dict(scanned=int(os.environ.get("LESSONS_FROM", "0") or 0) - 1, lessons=[], taught=[])


def save(out, st):
    tmp = os.path.join(out, "lessons.json.tmp")
    with open(tmp, "w") as f: json.dump(st, f, indent=1)
    os.replace(tmp, os.path.join(out, "lessons.json"))   # by rename, so the site never reads half a file


def scan(st, address, head, get_logs):
    """add the lessons taught since the last scan; get_logs(address, topic0, from_block, to_block) -> raw logs"""
    known, topic = {l["id"] for l in st["lessons"]}, taught_topic()
    a = st["scanned"] + 1
    while a <= head:
        b = min(head, a + SPAN - 1)
        for log in sorted(get_logs(address, topic, a, b), key=lambda e: (int(e["blockNumber"], 16), int(e["logIndex"], 16))):
            l = decode(log)
            if l["id"] in known: continue
            why = refused(l["text"])
            st["lessons"].append(dict(l, status="filtered" if why else "queued", why=why, hours=[], with_ok=0, without_ok=0, n=0))
            known.add(l["id"])
        st["scanned"] = b
        a = b + 1
    return st


def under_test(st):
    """the lesson being tested this hour: the one already testing, else the oldest queued (now testing), else None"""
    for l in st["lessons"]:
        if l["status"] == "testing": return l
    for l in st["lessons"]:
        if l["status"] == "queued":
            l["status"] = "testing"
            return l
    return None


def kept(st):
    return [l for l in st["lessons"] if l["id"] in st["taught"]]


def taught_block(st):
    """what Holmes reads after his own notes: the kept lessons, newest last"""
    ls = kept(st)
    if not ls: return ""
    return "\n\nTaught (lessons from holders, each kept after a public test):\n" + "\n".join(f"- {l['text']}" for l in ls)


def record(st, lesson, hour, with_ok, without_ok, n):
    """add one hour of the test; after TEST_HOURS hours the lesson is kept (more right with it) or rejected. Keeping a
    lesson beyond KEEP_MAX retires the oldest kept one."""
    lesson["hours"].append(hour)
    lesson["with_ok"] += with_ok
    lesson["without_ok"] += without_ok
    lesson["n"] += n
    if len(lesson["hours"]) >= TEST_HOURS:
        if lesson["with_ok"] > lesson["without_ok"]:
            lesson["status"] = "kept"
            taught = (st["taught"] + [lesson["id"]])[-KEEP_MAX:]
            for l in st["lessons"]:   # pushed out by newer kept lessons
                if l["id"] in st["taught"] and l["id"] not in taught: l["status"] = "retired"
            st["taught"] = taught
        else:
            lesson["status"] = "rejected"
    return st
