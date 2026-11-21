"use client";
// Page changes go through the logo. The memory ring closes over the page like an iris while it turns, holds as a
// small spinning mark if the next page is still coming, then opens onto it. As in the mark, emerald dots hold one
// side of the ring and silver dust breaks off the other, with one bright memory dot on its way in.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const CLOSE = 0.34, OPEN = 0.62;   // seconds
const TILT = -0.34, K = 0.56;      // the mark's tilt, and the ring's height against its width
const N = 900;

type Dot = { a: number; r: number; s: number; size: number };

export default function RouteRing() {
  const ref = useRef<HTMLCanvasElement>(null);
  const path = usePathname(), router = useRouter();
  const st = useRef({ phase: "idle" as "idle" | "closing" | "held" | "opening", t0: 0, start: 0, raf: 0, arrived: false, w: 0, h: 0, a0: 0, a1: 0, href: "", pushed: false });
  const dots = useRef<Dot[]>([]);

  useEffect(() => {
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    dots.current = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, r: gauss(), s: Math.random(), size: 0.9 + Math.random() * 1.7 }));
    const c = ref.current!, S = st.current;

    const draw = (a: number, spin: number, k: number) => {
      const ctx = c.getContext("2d")!, { w, h } = S, dpr = c.width / w;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#050c08"; ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2); ctx.rotate(TILT);
      ctx.globalCompositeOperation = "destination-out";   // the inside of the ring shows the page
      ctx.beginPath(); ctx.ellipse(0, 0, a, a * K, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      const band = 5 + a * 0.012;
      for (const d of dots.current) {
        const ang = d.a + spin, side = Math.cos(ang);
        const loose = side > 0.15 && d.s > 0.5 ? (side - 0.15) * (0.4 + d.s) : 0;   // the right side sheds silver dust
        const rr = a + d.r * band + loose * (24 + a * 0.16);
        const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr * K, near = Math.sin(ang) > 0 ? 1 : 0.6;
        ctx.fillStyle = loose ? `rgba(199, 206, 213, ${(0.6 * near).toFixed(3)})` : `rgba(${side < -0.6 && near === 1 ? "190, 246, 214" : "59, 220, 146"}, ${(0.92 * near).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, d.size * (loose ? 0.8 : 1), 0, Math.PI * 2); ctx.fill();
      }
      // the memory dot: from the front-left of the rim toward the middle, with a short trail
      for (let j = 0; j < 12; j++) {
        const u = Math.max(0, (k * 1.6) % 1 - j * 0.02), th = 2.55 + spin * 0.15 + 0.9 * u, rr = a * (1 - 0.62 * u);
        ctx.fillStyle = `rgba(240, 252, 244, ${(0.95 * (1 - j / 12)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(Math.cos(th) * rr, Math.sin(th) * rr * K, 2.6 * (1 - j / 14), 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = (now: number) => {
      const t = (now - S.t0) / 1000, total = (now - S.start) / 1000, spin = total * 1.9;
      let a = S.a0;
      if (S.phase === "closing") {
        const k = Math.min(1, t / CLOSE); a = S.a0 + (S.a1 - S.a0) * (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
        if (k >= 0.7 && !S.pushed) { S.pushed = true; router.push(S.href); }   // the screen is nearly covered: change the page
        if (k >= 1) { S.phase = "held"; S.t0 = now; }
      } else if (S.phase === "held") {
        a = S.a1 * (1 + 0.05 * Math.sin(t * 5));
        if (S.arrived || t > 6) { S.phase = "opening"; S.t0 = now; }
      } else if (S.phase === "opening") {
        const k = Math.min(1, t / OPEN); a = S.a1 + (S.a0 - S.a1) * (1 - (1 - k) ** 3);   // eases out: it opens fast, then settles
        if (k >= 1) { S.phase = "idle"; c.style.display = "none"; return; }
      }
      draw(a, spin, total);
      S.raf = requestAnimationFrame(loop);
    };

    const start = (href: string) => {
      const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio, 2);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.display = "block";
      // the open ring must contain every corner of the screen, so the page is fully uncovered at the start and the end
      let need = 0;
      for (const [x, y] of [[w / 2, h / 2], [-w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]]) {
        const u = x * Math.cos(TILT) + y * Math.sin(TILT), v = -x * Math.sin(TILT) + y * Math.cos(TILT);
        need = Math.max(need, Math.hypot(u, v / K));
      }
      Object.assign(S, { w, h, a0: need * 1.02 + 10, a1: Math.min(w, h) * 0.085, phase: "closing", arrived: false, pushed: false, href, t0: performance.now(), start: performance.now() });
      cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname || url.pathname.startsWith("/data/")) return;
      if (url.pathname.includes("/hours/") && location.pathname.includes("/hours/")) return;   // paging hour to hour stays instant
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      e.preventDefault();   // the router waits until the ring has nearly closed; the page is fetched meanwhile
      router.prefetch(url.pathname);
      if (st.current.phase === "idle") start(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);   // capture: the ring starts before the router handles the click
    return () => { document.removeEventListener("click", onClick, true); cancelAnimationFrame(S.raf); };
  }, [router]);

  // the new page has rendered: open as soon as the close has finished
  useEffect(() => { if (st.current.phase !== "idle") st.current.arrived = true; }, [path]);

  return <canvas ref={ref} className="route-ring" aria-hidden="true" />;
}
