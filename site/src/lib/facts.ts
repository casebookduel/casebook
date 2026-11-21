// What the runner knows for certain about the launchpad factory, so the site can check Holmes's notes against it.
// Taken from m0/duel.py: the two events it reads and the selectors it calls.
export const FACTORY_TOPICS = {
  "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607": "launch",
  "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259": "graduation",
} as const;

// A note line that names a 32-byte event topic the factory does not emit is marked as wrong.
export function checkLine(line: string): string | null {
  const topics = line.toLowerCase().match(/0x[0-9a-f]{64}/g) ?? [];
  const bad = topics.find((t) => !(t in FACTORY_TOPICS));
  return bad ? bad.slice(0, 10) : null;   // the page wraps this in a sentence in its own language
}

export const pText = (p: number) => (p < 0.0001 ? "p < 0.0001" : `p = ${p.toFixed(p < 0.01 ? 4 : 3)}`);
