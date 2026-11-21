"use client";
// A terminal that runs two real queries against this site's own data. The server renders it complete; the first time
// it scrolls into view the commands are typed out again, by writing to the DOM directly (no re-renders per letter).
import { useEffect, useRef } from "react";

type Step = { cmd: string; out: string };
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function html(steps: Step[], origin: string, upto: { s: number; c: number } | null) {
  return steps.map((st, i) => {
    if (upto && i > upto.s) return "";
    const cmd = st.cmd.replace("{origin}", origin), typing = !!upto && i === upto.s;
    return `<span class="term-step"><span class="term-p">$ </span>${esc(typing ? cmd.slice(0, Math.max(0, upto!.c)) : cmd)}${typing ? '<span class="term-caret"></span>' : ""}\n${typing ? "" : `<span class="term-out">${esc(st.out)}\n</span>`}</span>`;
  }).join("");
}

export default function Terminal({ steps, title }: { steps: Step[]; title: string }) {
  const ref = useRef<HTMLDivElement>(null), body = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current, pre = body.current, origin = window.location.origin;
    if (!el || !pre) return;
    pre.innerHTML = html(steps, origin, null);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || el.getBoundingClientRect().top < innerHeight * 0.85) return;
    pre.innerHTML = html(steps, origin, { s: 0, c: 0 });
    let timer = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      let s = 0, c = 0;
      const tick = () => {
        if (c < steps[s].cmd.replace("{origin}", origin).length) { c += 2; pre.innerHTML = html(steps, origin, { s, c }); timer = window.setTimeout(tick, 16); return; }
        if (s < steps.length - 1) { s += 1; c = 0; pre.innerHTML = html(steps, origin, { s, c: -1 }); timer = window.setTimeout(tick, 650); return; }
        pre.innerHTML = html(steps, origin, null);
      };
      timer = window.setTimeout(tick, 300);
    }, { rootMargin: "0px 0px -20% 0px" });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [steps]);
  return (
    <div className="term" ref={ref}>
      <div className="term-bar">
        <span className="mlabel" aria-hidden="true">{title}</span>
        <button type="button" className="term-copy mlabel" onClick={(e) => {
          const b = e.currentTarget, text = steps.map((st) => st.cmd.replace("{origin}", window.location.origin)).join("\n");
          navigator.clipboard?.writeText(text).then(() => { b.textContent = "Copied"; window.setTimeout(() => { b.textContent = "Copy"; }, 1600); }, () => {});
        }}>Copy</button>
      </div>
      <pre className="term-body mono" ref={body} dangerouslySetInnerHTML={{ __html: html(steps, "", null) }} />
    </div>
  );
}
