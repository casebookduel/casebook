import Link from "next/link";
import { fmt } from "@/i18n/config";
import type { Dict } from "@/i18n/en";
import { EXPLORER } from "@/lib/explorer";
import type { Lesson } from "@/lib/lessons";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// One lesson as the teach page and the home page list it: its number, status and teacher, the text (or why it was
// not tested), the result of its test with the hours it ran in, and the burn transaction.
export default function LessonRow({ l, t, L }: { l: Lesson; t: Dict["teach"]; L: (p: string) => string }) {
  const [hBefore, hAfter] = t.hoursL.split("{h}");
  return (
    <div className="version">
      <div>
        <h3>#{l.id}</h3>
        <p className="meta"><span className={`lesson-st ${l.status}`}>{t.status[l.status]}</span><br />{fmt(t.by, { a: short(l.teacher) })}</p>
      </div>
      <div>
        {l.status === "filtered"
          ? <p className="dim">{fmt(t.hidden, { why: ((t.why as Record<string, string>)[l.why ?? ""] ?? l.why ?? "").replace(/[.。]$/, "") })}</p>
          : <p className="lesson-text">{l.text}</p>}
        {l.n > 0 && (
          <p className="meta">
            {fmt(t.result, { w: l.with_ok, h: l.without_ok, n: l.n })} · {hBefore}
            {l.hours.map((h, i) => <span key={h}>{i ? ", " : ""}<Link prefetch={false} href={L(`/hours/${h}`)}>{h}</Link></span>)}{hAfter}
          </p>
        )}
        {l.tx && <p className="meta"><a href={`${EXPLORER}/tx/${l.tx}`} target="_blank" rel="noreferrer">{t.tx}</a></p>}
      </div>
    </div>
  );
}
