"use client";
// When the runner grades a new hour, an open page picks it up without a reload: a light check once a minute,
// and a refresh of the server data only when something changed.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LiveRefresh({ updated }: { updated: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const d = await (await fetch("/data/updated.json", { cache: "no-store" })).json();
        if (typeof d.updated === "number" && d.updated > updated) router.refresh();
      } catch { /* offline for a moment: try again next minute */ }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [updated, router]);
  return null;
}
