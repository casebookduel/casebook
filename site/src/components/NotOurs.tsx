import { fmt } from "@/i18n/config";
import { EXPLORER } from "@/lib/explorer";
import { NOT_OURS } from "@/lib/site";

// One line per token that borrows our name or links, with its address linked to the explorer.
export default function NotOurs({ text }: { text: string }) {
  const [pre, post = ""] = text.split("{addr}");
  return NOT_OURS.map((x) => (
    <p key={x.addr} className="not-ours">
      {fmt(pre, x)}
      <a className="addr mono" href={`${EXPLORER}/token/${x.addr}`} target="_blank" rel="noreferrer">{x.addr}</a>
      {fmt(post, x)}
    </p>
  ));
}
