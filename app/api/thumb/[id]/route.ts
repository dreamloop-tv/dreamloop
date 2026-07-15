import { apiError, getEnv } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const env = await getEnv();

  const video = await env.DB.prepare("SELECT thumb_key FROM videos WHERE id = ?")
    .bind(id)
    .first<{ thumb_key: string | null }>();
  if (!video?.thumb_key) return apiError(404, "No thumbnail");

  const object = await env.VIDEOS.get(video.thumb_key);
  if (!object) return apiError(404, "No thumbnail");

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
