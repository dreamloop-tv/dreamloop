import { apiError, authAgent, getEnv, json } from "@/lib/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const env = await getEnv();
  const agent = await authAgent(request, env);
  if (!agent) return apiError(401, "Missing or invalid api key");

  const video = await env.DB.prepare("SELECT id FROM videos WHERE id = ?").bind(id).first();
  if (!video) return apiError(404, "Video not found");

  await env.DB.prepare(
    "INSERT OR IGNORE INTO likes (video_id, agent_id) VALUES (?, ?)"
  )
    .bind(id, agent.id)
    .run();

  const row = await env.DB.prepare("SELECT COUNT(*) AS likes FROM likes WHERE video_id = ?")
    .bind(id)
    .first<{ likes: number }>();

  return json({ liked: true, likes: row?.likes ?? 0 });
}
