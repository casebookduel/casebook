// The launch files. m1/files.py (systemd casebook-files) reads every launchpad launch from the chain and answers on
// 127.0.0.1:FILES_PORT; this is the site's side of it. Holders see each file as it opens; everyone else FILES_DELAY
// seconds after the launch. Off until OPEN_FEATURES names "files".
import { cookies } from "next/headers";
import { connection } from "next/server";
import { holderFromHeader, stillHolds } from "./holder";
import { OPEN } from "./open";

export const FILES_ON = OPEN.has("files");
export const FILES_DELAY = Number(process.env.FILES_DELAY || 900);
const BASE = `http://127.0.0.1:${Number(process.env.FILES_PORT || 7461)}`;

export type Sniper = { rank: number; n: number } | null;
export type Recent = { token: string; symbol: string | null; ts: number; grad_ts: number | null; dev_sell_s: number | null; first_buyer: string | null };
export type CreatorRecord = {
  n24: number; n7: number; n30: number; first_seen: number; grads: number;
  earlier: number; sold_on: number; sold_60: number; sold_median_s: number | null; settled: number; no_buyer: number; recent: Recent[];
};
export type LaunchFile = {
  token: string; curve: string; creator: string; block: number; ts: number; symbol: string | null; name: string | null;
  first_buyer: string | null; first_buy_s: number | null; dev_sell_s: number | null; dev_sells: number; buys: number; sells: number;
  grad_ts: number | null; trades_seen: boolean; first_buyer_sniper: Sniper; creator_record: CreatorRecord;
};
export type FileStats = { launches_24h: number; creators_24h: number; repeat_creators_24h: number; first_buys_24h: number; top8_first_buys_24h: number;
  last_block: number; head: number; last_ts: number; since: number; now: number };

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + path, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

// the request's time, for pages rendered per request; the readers below wait for the request first (connection()), so
// Next never meets the clock while it prerenders a shell
export const now = () => Math.floor(Date.now() / 1000);
// Everyone who is not a holder sees the same delayed feed, so it is read at most once every 10 seconds per page shape:
// a crowd from one post costs the files service a handful of reads, not one per visitor and poll.
const shared = new Map<string, { at: number; v: Promise<LaunchFile[] | null> }>();
export async function getFeed(live: boolean, before?: number, limit = 30) {
  await connection();
  const read = () => get<LaunchFile[]>(`/feed?until=${now() - (live ? 0 : FILES_DELAY)}&limit=${limit}${before ? `&before=${before}` : ""}`);
  if (live) return read();
  // the delayed feed also drops, from each dev's latest launches, the ones still closed to everyone but holders
  const closed = (fs: LaunchFile[] | null) => fs && fs.map((f) => ({ ...f, creator_record: { ...f.creator_record, recent: f.creator_record.recent.filter((r) => r.ts <= now() - FILES_DELAY) } }));
  const key = `${before ?? ""}:${limit}`, hit = shared.get(key), t = Date.now();
  if (hit && t - hit.at < 10_000) return hit.v;
  if (shared.size > 200) shared.clear();
  const v = read().then(closed);
  shared.set(key, { at: t, v });
  return v;
}
export async function getFile(token: string) {
  await connection();
  return /^0x[0-9a-fA-F]{40}$/.test(token) ? get<LaunchFile>(`/file/${token.toLowerCase()}`) : null;
}
export async function getFileStats() {
  await connection();
  return get<FileStats>("/stats");
}
// a file younger than the delay is for holders only
export const openFor = (f: LaunchFile) => f.ts + FILES_DELAY;
export const isOpen = (f: LaunchFile) => now() >= openFor(f);

// whether this visitor sees files live: a holder cookie of today whose wallet still holds (checked at most once a minute)
export async function liveViewer(): Promise<string | null> {
  const a = holderFromHeader((await cookies()).toString());
  return a && (await stillHolds(a)) ? a : null;
}
export async function liveRequest(req: Request): Promise<string | null> {
  const a = holderFromHeader(req.headers.get("cookie") ?? "");
  return a && (await stillHolds(a)) ? a : null;
}
