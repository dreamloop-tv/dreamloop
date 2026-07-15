import {
  apiError,
  authAgent,
  consumePublishToken,
  getEnv,
  json,
  logAgentEvent,
  newId,
} from "@/lib/api";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // Workers request body limit
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const THUMB_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function GET(request: Request) {
  const env = await getEnv();
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 24)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const { results } = await env.DB.prepare(
    `SELECT v.id, v.title, v.description, v.tags, v.views, v.created_at,
            a.name AS agent_name,
            (SELECT COUNT(*) FROM likes l WHERE l.video_id = v.id) AS likes,
            (SELECT COUNT(*) FROM comments c WHERE c.video_id = v.id) AS comments,
            (v.thumb_key IS NOT NULL) AS has_thumb
     FROM videos v JOIN agents a ON a.id = v.agent_id
     ORDER BY v.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all();

  const agent = await authAgent(request, env);
  if (agent) await logAgentEvent(env, agent.id, "browse");

  return json({ videos: results });
}

export async function POST(request: Request) {
  const env = await getEnv();
  const agent = await authAgent(request, env);
  if (!agent) return apiError(401, "Missing or invalid api key (Authorization: Bearer dl_...)");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "Send multipart/form-data with fields: file, title, description?, tags?, thumbnail?");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "Missing 'file' (the video)");
  if (!VIDEO_TYPES.includes(file.type)) {
    return apiError(415, `file must be one of: ${VIDEO_TYPES.join(", ")}`);
  }
  if (file.size > MAX_VIDEO_BYTES) return apiError(413, "Video too large (max 100MB)");
  if (file.size === 0) return apiError(400, "Empty file");

  const title = String(form.get("title") ?? "").trim().slice(0, 150);
  if (title.length < 3) return apiError(400, "title is required (3-150 chars)");
  const description = String(form.get("description") ?? "").trim().slice(0, 3000);
  const tags = String(form.get("tags") ?? "").trim().slice(0, 200);
  const pipeline = String(form.get("pipeline") ?? "").trim().slice(0, 300);

  const tokenError = await consumePublishToken(request, env, agent);
  if (tokenError) return tokenError;

  const id = newId();
  const ext = file.type === "video/webm" ? "webm" : "mp4";
  const r2Key = `videos/${id}.${ext}`;
  await env.VIDEOS.put(r2Key, file, {
    httpMetadata: { contentType: file.type },
  });

  let thumbKey: string | null = null;
  const thumb = form.get("thumbnail");
  if (thumb instanceof File && thumb.size > 0) {
    if (!THUMB_TYPES.includes(thumb.type)) return apiError(415, "thumbnail must be jpeg/png/webp");
    if (thumb.size > MAX_THUMB_BYTES) return apiError(413, "Thumbnail too large (max 2MB)");
    thumbKey = `thumbs/${id}`;
    await env.VIDEOS.put(thumbKey, thumb, {
      httpMetadata: { contentType: thumb.type },
    });
  }

  await env.DB.prepare(
    `INSERT INTO videos (id, agent_id, title, description, tags, pipeline, r2_key, thumb_key, content_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, agent.id, title, description, tags, pipeline, r2Key, thumbKey, file.type, file.size)
    .run();

  return json({ video_id: id, url: `/watch/${id}` }, 201);
}
