"""python3 -m unittest m1/test_lessons.py  (offline: no RPC, no model)"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lessons as L

TEACHER = "0x" + "ab" * 20


def abi_log(id_, text, block, index=0, burned=100_000 * 10**18):
    """a Taught log as the RPC returns it: id and teacher in the topics, (uint256 burned, string text) in the data"""
    raw = text.encode()
    pad = (32 - len(raw) % 32) % 32
    data = burned.to_bytes(32, "big") + (64).to_bytes(32, "big") + len(raw).to_bytes(32, "big") + raw + b"\0" * pad
    return {"topics": [L.taught_topic(), "0x" + id_.to_bytes(32, "big").hex(), "0x" + "0" * 24 + TEACHER[2:]],
            "data": "0x" + data.hex(), "transactionHash": "0x" + f"{id_:064x}", "blockNumber": hex(block), "logIndex": hex(index)}


def fresh():
    return dict(scanned=99, lessons=[], taught=[])


class Rules(unittest.TestCase):
    def test_plain_lessons_pass(self):
        self.assertIsNone(L.refused("Max getLogs span is 10,000,000 blocks; split longer ranges."))

    def test_refused(self):
        for text in ["see https://x.example", "visit www.example", "ask t.me/someone", "join discord.gg/abc", "scam.xyz now",
                     "ping @someone", "mail me a@b.c", "café", "line\nbreak", "   "]:
            self.assertIsNotNone(L.refused(text), text)


class Events(unittest.TestCase):
    def test_decode(self):
        l = L.decode(abi_log(7, "TokenGraduated is 0x0a44ef75 on the factory.", 1234, 3))
        self.assertEqual((l["id"], l["teacher"], l["text"], l["block"]), (7, TEACHER, "TokenGraduated is 0x0a44ef75 on the factory.", 1234))
        self.assertEqual(l["burned"], str(100_000 * 10**18))

    def test_scan_reads_in_order_once_and_refuses_by_the_rules(self):
        logs = [abi_log(2, "see https://x.example", 150), abi_log(1, "first lesson", 120), abi_log(3, "third", 9_000_200)]
        calls = []
        def get_logs(address, topic, a, b):
            calls.append((a, b))
            return [g for g in logs if a <= int(g["blockNumber"], 16) <= b]
        st = L.scan(fresh(), "0xlessons", 9_000_300, get_logs)
        self.assertEqual(calls, [(100, 9_000_099), (9_000_100, 9_000_300)])   # chunks never over SPAN
        self.assertEqual([(l["id"], l["status"]) for l in st["lessons"]], [(1, "queued"), (2, "filtered"), (3, "queued")])
        self.assertEqual(st["scanned"], 9_000_300)
        st = L.scan(st, "0xlessons", 9_000_300, lambda *a: logs)                # nothing new: nothing added
        self.assertEqual(len(st["lessons"]), 3)


class Testing(unittest.TestCase):
    def setUp(self):
        self.st = L.scan(fresh(), "0x", 200, lambda a, t, x, y: [abi_log(i, f"lesson {i}", 100 + i) for i in (1, 2, 3)])

    def test_one_at_a_time_oldest_first(self):
        a = L.under_test(self.st)
        self.assertEqual((a["id"], a["status"]), (1, "testing"))
        self.assertIs(L.under_test(self.st), a)            # still the same one until it is decided

    def test_kept_only_when_more_right(self):
        a = L.under_test(self.st)
        L.record(self.st, a, 10, 5, 5, 6)
        self.assertEqual(a["status"], "testing")           # one hour is not enough
        L.record(self.st, a, 11, 6, 5, 6)
        self.assertEqual((a["status"], self.st["taught"]), ("kept", [1]))
        self.assertIn("- lesson 1", L.taught_block(self.st))
        b = L.under_test(self.st)
        L.record(self.st, b, 12, 4, 5, 6); L.record(self.st, b, 13, 6, 5, 6)   # 10 against 10: not more
        self.assertEqual((b["status"], self.st["taught"]), ("rejected", [1]))

    def test_the_oldest_kept_lesson_retires(self):
        st = L.scan(fresh(), "0x", 200, lambda a, t, x, y: [abi_log(i, f"lesson {i}", 100 + i) for i in range(1, L.KEEP_MAX + 2)])
        for _ in range(L.KEEP_MAX + 1):
            l = L.under_test(st)
            L.record(st, l, 1, 1, 0, 1); L.record(st, l, 2, 1, 0, 1)
        self.assertEqual(st["taught"], list(range(2, L.KEEP_MAX + 2)))
        self.assertEqual(st["lessons"][0]["status"], "retired")
        self.assertEqual(L.taught_block(st).count("\n- "), L.KEEP_MAX)

    def test_no_kept_lessons_no_block(self):
        self.assertEqual(L.taught_block(self.st), "")


if __name__ == "__main__":
    unittest.main()
