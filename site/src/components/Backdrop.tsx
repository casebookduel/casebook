"use client";
// The page's backdrop: the logo's memory ring, huge and faint, turning slowly behind every section, with a little
// drifting dust. It turns further as you scroll, so the page reads as one space instead of stacked boxes.
// Emerald dots hold the left of the ring; on the right, silver dust breaks off, as in the mark.
import { useEffect, useRef } from "react";

const TILT = -0.34, FLAT = 0.3;

export default function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches, small = innerWidth < 700;
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const ring = Array.from({ length: small ? 1000 : 2400 }, () => ({ a: Math.random() * Math.PI * 2, r: gauss(), s: Math.random() }));
    const dust = Array.from({ length: small ? 40 : 90 }, () => ({ x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75 }));
    let w = 0, h = 0, raf = 0, last = performance.now(), sy = scrollY;
    const size = () => {
      const dpr = 1;   // faint 1-2 px dots: device pixels add nothing here and cost four times the fill on a retina screen
      w = innerWidth; h = innerHeight; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const FRAME = 1000 / 30;   // a ring that turns this slowly needs no more than 30 frames a second
    const COLORS = ["rgba(59, 220, 146, 0.17)", "rgba(59, 220, 146, 0.34)", "rgba(199, 206, 213, 0.12)", "rgba(199, 206, 213, 0.24)"];
    const buckets: number[][] = [[], [], [], []];   // emerald far, emerald near, silver far, silver near: x, y, size
    let drawn = -Infinity;
    const draw = (now: number) => {
      if (!still && !document.hidden) raf = requestAnimationFrame(draw);
      if (!still && now - drawn < FRAME - 1) return;
      drawn = now;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      sy += (scrollY - sy) * (1 - Math.pow(0.88, dt * 60));   // eased, so the ring never jumps with the wheel
      const turn = now * 0.000012 + sy * 0.00042;
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.7, cy = h * 0.56, rx = Math.max(w, h) * 0.62, ct = Math.cos(TILT), st = Math.sin(TILT);
      for (const d of ring) {
        const ang = d.a + turn, side = Math.cos(ang), near = Math.sin(ang) > 0;
        const loose = side > 0.2 && d.s > 0.55 ? (side - 0.2) * d.s : 0;
        const rr = rx * (1 + loose * 0.22) + d.r * (10 + rx * 0.012);
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr * FLAT - loose * 40 * (d.s - 0.75);
        const x = cx + px * ct - py * st, y = cy + px * st + py * ct;
        if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
        buckets[(loose ? 2 : 0) + (near ? 1 : 0)].push(x, y, near ? 2.2 : 1.4);
      }
      // one fill per colour: setting the fill style for every dot is the slow part of a 2D canvas
      buckets.forEach((b, i) => {
        if (!b.length) return;
        ctx.fillStyle = COLORS[i];
        ctx.beginPath();
        for (let j = 0; j < b.length; j += 3) ctx.rect(b[j], b[j + 1], b[j + 2], b[j + 2]);
        ctx.fill();
        b.length = 0;
      });
      for (const d of dust) {
        if (!still) d.y -= dt * 0.006 * d.z;
        const y = ((((d.y * h - sy * 0.08 * d.z) % h) + h) % h), x = d.x * w;
        ctx.fillStyle = `rgba(221, 247, 230, ${0.08 + 0.16 * d.z})`;
        ctx.fillRect(x, y, 1 + d.z, 1 + d.z);
      }
    };
    const wake = () => { if (!still && !document.hidden) { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(draw); } };
    size(); draw(performance.now());
    const onResize = () => { size(); if (still) draw(performance.now()); };
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", wake);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", wake); };
  }, []);
  return <canvas ref={ref} className="backdrop" aria-hidden="true" />;
}
