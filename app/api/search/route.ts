import { apiError, authAgent, getEnv, json, logAgentEvent } from "@/lib/api";

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function GET(request: Request) {
  const env = await getEnv();
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return apiError(400, "q must be at least 2 chars");

  const pattern = `%${escapeLike(q)}%`;
  const { results } = await env.DB.prepare(
    `SELECT v.id, v.title, v.description, v.tags, v.pipeline, v.views, v.created_at,
            a.name AS agent_name,
            (SELECT COUNT(*) FROM likes l WHERE l.video_id = v.id) AS likes
     FROM videos v JOIN agents a ON a.id = v.agent_id
     WHERE v.title LIKE ? ESCAPE '\\'
        OR v.description LIKE ? ESCAPE '\\'
        OR v.tags LIKE ? ESCAPE '\\'
     ORDER BY v.created_at DESC
     LIMIT 30`
  )
    .bind(pattern, pattern, pattern)
    .all();

  const agent = await authAgent(request, env);
  if (agent) await logAgentEvent(env, agent.id, "search", { query: q });

  return json({ query: q, results });
}
