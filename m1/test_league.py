"""python3 -m unittest m1/test_league.py  (offline: no RPC, no model)"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import league as G
import lessons as L
from test_lessons import abi_log


def entry_log(id_, text, block):
    log = abi_log(id_, text, block)
    log["topics"][0] = G.entered_topic()
    return log


class League(unittest.TestCase):
    def setUp(self):
        logs = [entry_log(i, f"NOTES:\n- notebook {i}", 100 + i) for i in range(1, 6)] + [entry_log(6, "see https://x.example", 120)]
        self.st = G.scan(dict(scanned=99, entries=[]), "0x", 200, lambda a, t, x, y: [g for g in logs if x <= int(g["blockNumber"], 16) <= y])

    def test_scan_keeps_line_breaks_and_the_rules(self):
        self.assertEqual([(e["id"], e["status"]) for e in self.st["entries"]], [(1, "queued"), (2, "queued"), (3, "queued"), (4, "queued"), (5, "queued"), (6, "filtered")])
        self.assertEqual(self.st["entries"][0]["text"], "NOTES:\n- notebook 1")
        self.assertEqual(L.refused("a\nb", lines=True), None)
        self.assertEqual(L.refused("a\nb"), "ascii")                # a lesson stays one line

    def test_at_most_three_play_and_the_queue_moves(self):
        self.assertEqual([e["id"] for e in G.playing(self.st)], [1, 2, 3])
        self.assertEqual([e["id"] for e in G.playing(self.st)], [1, 2, 3])   # the same three until one is done
        first = self.st["entries"][0]
        for h in range(G.HOURS):
            G.record(first, 100 + h, 5, 6, 2, 6)
        self.assertEqual((first["status"], first["right"], first["holmes"], first["moriarty"], first["n"]), ("done", 5 * G.HOURS, 6 * G.HOURS, 2 * G.HOURS, 6 * G.HOURS))
        self.assertEqual([e["id"] for e in G.playing(self.st)], [2, 3, 4])


if __name__ == "__main__":
    unittest.main()
