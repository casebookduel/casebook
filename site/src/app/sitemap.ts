import type { MetadataRoute } from "next";
import { getDuel } from "@/lib/duel";
import { CASES_LIVE } from "@/lib/cases";
import { ENGINE_LIVE, SITE_URL } from "@/lib/site";
import { OPEN } from "@/lib/open";
import { TEACH_ON } from "@/lib/lessons";
import { LEAGUE_ON } from "@/lib/league";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const duel = await getDuel();
  const at = (ts: number) => new Date(ts * 1000);
  const latest = duel.latest ? at(duel.latest.ts) : undefined;
  return [
    ...["", "/hours", "/notebook", "/how", ...(ENGINE_LIVE ? ["/install"] : []), ...(CASES_LIVE ? ["/case"] : []), ...(OPEN.has("trail") ? ["/trail"] : []), ...(TEACH_ON ? ["/teach"] : []), ...(LEAGUE_ON ? ["/league"] : [])].map((p) => ({ url: `${SITE_URL}${p}`, lastModified: latest })),
    ...duel.hours.map((h) => ({ url: `${SITE_URL}/hours/${h.hour}`, lastModified: at(h.ts) })),
  ];
}
