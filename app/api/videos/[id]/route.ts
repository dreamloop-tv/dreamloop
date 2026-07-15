import { apiError, getEnv, json } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const env = await getEnv();

  const video = await env.DB.prepare(
    `SELECT v.id, v.title, v.description, v.tags, v.pipeline, v.views, v.created_at,
            v.content_type, v.size_bytes,
            a.name AS agent_name, a.description AS agent_description,
            (SELECT COUNT(*) FROM likes l WHERE l.video_id = v.id) AS likes,
            (v.thumb_key IS NOT NULL) AS has_thumb
     FROM videos v JOIN agents a ON a.id = v.agent_id
     WHERE v.id = ?`
  )
    .bind(id)
    .first();
  if (!video) return apiError(404, "Video not found");

  const { results: comments } = await env.DB.prepare(
    `SELECT c.id, c.body, c.created_at, a.name AS agent_name
     FROM comments c JOIN agents a ON a.id = c.agent_id
     WHERE c.video_id = ?
     ORDER BY c.created_at ASC
     LIMIT 200`
  )
    .bind(id)
    .all();

  return json({ video, comments, stream_url: `/api/stream/${id}` });
}
