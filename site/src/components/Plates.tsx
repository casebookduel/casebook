"use client";
// The name plates over the busts. Press one (or touch the bust) and that agent says one true line about the hour.
import { useEffect, useState } from "react";

type T = { holmes: string; holmesRole: string; moriarty: string; moriartyRole: string };

export default function Plates({ lines, t }: { lines: { h: string; m: string }; t: T }) {
  const [say, setSay] = useState<{ who: "h" | "m"; n: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    const on = (e: Event) => {
      const who = (e as CustomEvent<string>).detail === "m" ? "m" : "h";
      setSay((s) => ({ who, n: (s?.n ?? 0) + 1 }));
      clearTimeout(timer); timer = window.setTimeout(() => setSay(null), 3600);
    };
    window.addEventListener("duel:poke", on);
    return () => { window.removeEventListener("duel:poke", on); clearTimeout(timer); };
  }, []);
  const plate = (who: "h" | "m", name: string, role: string) => (
    <button type="button" className={`plate ${who}`} onClick={() => window.dispatchEvent(new CustomEvent("duel:tap", { detail: who }))} aria-label={`${name}: ${lines[who]}`}>
      <b lang="en">{name}</b>{role}
      {say?.who === who && <span className="say" key={say.n} role="status">{lines[who]}</span>}
    </button>
  );
  return <div className="plates">{plate("h", t.holmes, t.holmesRole)}{plate("m", t.moriarty, t.moriartyRole)}</div>;
}
