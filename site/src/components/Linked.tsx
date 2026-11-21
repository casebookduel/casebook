// Question text with every address and block number linked to the explorer, so any answer key can be checked.
import { EXPLORER } from "@/lib/explorer";

export const addrLink = (a: string, full = false) => (
  <a className="addr mono" href={`${EXPLORER}/address/${a}`} title={a} target="_blank" rel="noreferrer">
    {full ? a : `${a.slice(0, 6)}…${a.slice(-4)}`}
  </a>
);

export default function Linked({ text, full = false }: { text: string; full?: boolean }) {
  const parts = text.split(/(0x[0-9a-fA-F]{40}|block \d{6,})/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^0x[0-9a-fA-F]{40}$/.test(p)) return <span key={i}>{addrLink(p, full)}</span>;
        const b = /^block (\d+)$/.exec(p);
        if (b) return <span key={i}>block <a className="addr mono" href={`${EXPLORER}/block/${b[1]}`} target="_blank" rel="noreferrer">{Number(b[1]).toLocaleString("en-US")}</a></span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
