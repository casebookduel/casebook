// Every lesson taught to Holmes with its status and test result, as on /teach, for anyone (or any agent) checking it.
import { getLessons, TEACH_ON } from "@/lib/lessons";

export async function GET() {
  if (!TEACH_ON) return new Response("Not found", { status: 404 });
  return Response.json(await getLessons(), { headers: { "cache-control": "public, max-age=60" } });
}
