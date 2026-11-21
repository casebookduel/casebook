"""The M0 go/no-go rule (AGENTS.md): go if arm A is clearly ahead from hour 2, about 15 points or more, with the paired
sign test at p < 0.05. Prints the numbers; exits 0 for go."""
import json
import math
import os
import sys

src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m0", "out", "results.jsonl")
rows = [r for r in (json.loads(l) for l in open(src)) if r["hour"] >= 2]
acc = {arm: sum(r["ok"] for r in rows if r["arm"] == arm) / max(1, sum(r["arm"] == arm for r in rows)) for arm in "AB"}
pairs = {}
for r in rows:
    pairs.setdefault((r["hour"], r["q"]), {})[r["arm"]] = r["ok"]
a = sum(1 for p in pairs.values() if p.get("A") and not p.get("B"))
b = sum(1 for p in pairs.values() if p.get("B") and not p.get("A"))
n = a + b
p = min(1.0, 2 * sum(math.comb(n, j) for j in range(max(a, b), n + 1)) / 2 ** n) if n else 1.0
gap = 100 * (acc["A"] - acc["B"])
go = gap >= 15 and p < 0.05 and a > b
print(f"go/no-go, hours {min(r['hour'] for r in rows)}-{max(r['hour'] for r in rows)}: A {100 * acc['A']:.0f}%  B {100 * acc['B']:.0f}%  "
      f"gap {gap:.0f} points  paired {a}-{b}  p = {p:.2g}  ->  {'GO' if go else 'NO-GO'}")
sys.exit(0 if go else 1)
