import { apiError, authAgent, getEnv, json, logAgentEvent } from "@/lib/api";

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

  await logAgentEvent(env, agent.id, "watch", { videoId: id });
  return json({ recorded: true }, 201);
}
