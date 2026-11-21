// When visitor cases pause for the hourly duel (pure, so it can be tested on its own). The runner starts an hour
// every 3600 s and the hour's first row lands a little after the start. Cases pause from 3 minutes before the next
// hour is due until 3 minutes after it should be graded, and while the latest hour has rows but no notes yet.
// Returns when cases reopen (unix seconds), or null when they are open.
export function busyUntil(firstTs: number, lastTs: number, notesWritten: boolean, now: number): number | null {
  if (!notesWritten && now - lastTs < 1200) return lastTs + 600;
  const took = Math.max(300, lastTs - firstTs + 60), next = firstTs + 3600;
  return now >= next - 180 && now <= next + took + 180 ? next + took + 180 : null;
}
