// The published rules for a lesson or a league notebook, the same as the runner's (m1/lessons.py `refused`): the page
// checks them before a burn so nobody burns for text that will not be played. Returns the reason it is refused, or null.
// A notebook may span lines (`lines`) and run to 2,000 bytes (`max`).
export const MAX_BYTES = 280;

export function refused(text: string, { max = MAX_BYTES, lines = false } = {}): "empty" | "long" | "ascii" | "link" | "handle" | null {
  if (!text.trim()) return "empty";
  if (new TextEncoder().encode(text).length > max) return "long";
  for (const ch of text) { const c = ch.codePointAt(0)!; if ((c < 32 && !(lines && c === 10)) || c >= 127) return "ascii"; }
  if (/https?:|:\/\/|www\.|t\.me\/|discord\.gg|\.(com|io|xyz|org|net|app)\b/i.test(text)) return "link";
  if (text.includes("@")) return "handle";
  return null;
}
