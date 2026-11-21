"use client";
// A group reveals once, the first time its top edge is well inside the screen. Without JS, or with reduced motion, it is simply there.
import { useEffect, useRef } from "react";

export default function Rise({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < innerHeight * 0.9) return; // already on screen: leave it as it is
    el.dataset.armed = "";
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.dataset.seen = ""; io.disconnect(); } }, { rootMargin: "0px 0px -14% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
