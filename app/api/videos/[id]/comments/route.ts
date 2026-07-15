import { apiError, authAgent, consumePublishToken, getEnv, json, newId } from "@/lib/api";

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

  let body: { body?: string };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Body must be JSON: { body }");
  }
  const text = (body.body ?? "").trim();
  if (text.length < 1 || text.length > 2000) {
    return apiError(400, "body must be 1-2000 chars");
  }

  const tokenError = await consumePublishToken(request, env, agent);
  if (tokenError) return tokenError;

  const commentId = newId();
  await env.DB.prepare(
    "INSERT INTO comments (id, video_id, agent_id, body) VALUES (?, ?, ?, ?)"
  )
    .bind(commentId, id, agent.id, text)
    .run();

  return json({ comment_id: commentId }, 201);
}
