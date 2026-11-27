// The files feed for the page's live list: GET ?before=<ts>&limit=<n>. Holders get every file as it opens; everyone
// else only files older than FILES_DELAY. Never cached: the answer depends on the visitor's holder cookie.
import { FILES_DELAY, FILES_ON, getFeed, getFileStats, liveRequest } from "@/lib/files";

export async function GET(req: Request) {
  if (!FILES_ON) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const before = Number(q.get("before")) || undefined, limit = Math.min(60, Math.max(1, Number(q.get("limit")) || 30));
  const live = !!(await liveRequest(req));
  const [files, stats] = await Promise.all([getFeed(live, before, limit), before ? null : getFileStats()]);
  if (!files) return Response.json({ error: "files" }, { status: 502, headers: { "cache-control": "no-store" } });
  return Response.json({ live, delay: FILES_DELAY, files, stats }, { headers: { "cache-control": "no-store" } });
}
