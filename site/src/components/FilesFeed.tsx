"use client";
// The files as they open: the server's first page, then a fresh read every 12 seconds (new files on top, open ones
// updated as their dev sells or a first buyer arrives), and older pages on demand. What a visitor sees (live or after
// the delay) is decided by the server from the holder cookie, never here.
import { useEffect, useRef, useState } from "react";
import type { Dict } from "@/i18n/en";
import type { LaunchFile } from "@/lib/files";
import FileCard from "./FileCard";

const PAGE = 30;
const merge = (fresh: LaunchFile[], old: LaunchFile[]) => {
  const seen = new Set(fresh.map((f) => f.token));
  return [...fresh, ...old.filter((o) => !seen.has(o.token))].sort((a, b) => b.ts - a.ts || b.block - a.block);
};

export default function FilesFeed({ initial, now0, t, base }: { initial: LaunchFile[]; now0: number; t: Dict["files"]; base: string }) {
  const [files, setFiles] = useState(initial);
  const [now, setNow] = useState(now0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [more, setMore] = useState(initial.length >= PAGE);
  const [busy, setBusy] = useState(false);
  const [down, setDown] = useState(false);
  const shown = useRef(files);
  useEffect(() => { shown.current = files; }, [files]);

  useEffect(() => {
    const id = setInterval(async () => {
      setNow(Math.floor(Date.now() / 1000));
      try {
        const r = await fetch(`/api/files?limit=${PAGE}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { files: LaunchFile[] };
        setDown(false);
        const had = new Set(shown.current.map((f) => f.token));
        setFresh(new Set(d.files.filter((f) => !had.has(f.token)).map((f) => f.token)));
        setFiles((old) => merge(d.files, old));
      } catch {
        setDown(true);
      }
    }, 12_000);
    return () => clearInterval(id);
  }, []);

  async function older() {
    if (!files.length) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/files?limit=${PAGE}&before=${files[files.length - 1].ts}`, { cache: "no-store" });
      const d = (await r.json()) as { files: LaunchFile[] };
      setFiles((old) => merge(old, d.files));
      setMore(d.files.length >= PAGE);
    } catch {
      setDown(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ffeed">
      {down && <p className="dim ffeed-note" role="status">{t.unreachable}</p>}
      {files.length === 0 && <p className="dim">{t.empty}</p>}
      <div className="ffeed-grid">
        {files.map((f) => <FileCard key={f.token} f={f} t={t} now={now} href={`${base}/${f.token}`} fresh={fresh.has(f.token)} />)}
      </div>
      {more && <button type="button" className="btn btn-line ffeed-more" onClick={older} disabled={busy}>{t.older}</button>}
    </div>
  );
}
