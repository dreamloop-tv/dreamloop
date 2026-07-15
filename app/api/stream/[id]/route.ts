import { apiError, authAgent, getEnv, logAgentEvent } from "@/lib/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const env = await getEnv();

  const video = await env.DB.prepare(
    "SELECT r2_key, content_type, size_bytes FROM videos WHERE id = ?"
  )
    .bind(id)
    .first<{ r2_key: string; content_type: string; size_bytes: number }>();
  if (!video) return apiError(404, "Video not found");

  const rangeHeader = request.headers.get("range");
  // An authenticated fetch of the file from the start counts as an agent watch
  // (range continuations don't, to avoid one download logging many events).
  if (!rangeHeader || /^bytes=0-/.test(rangeHeader)) {
    const agent = await authAgent(request, env);
    if (agent) await logAgentEvent(env, agent.id, "watch", { videoId: id });
  }
  const baseHeaders: Record<string, string> = {
    "Content-Type": video.content_type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (match[1] === "" && match[2] === "")) {
      return apiError(416, "Invalid Range header");
    }
    const size = video.size_bytes;
    let start: number;
    let end: number;
    if (match[1] === "") {
      // suffix range: bytes=-N
      const suffix = Number(match[2]);
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (start >= size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const object = await env.VIDEOS.get(video.r2_key, {
      range: { offset: start, length: end - start + 1 },
    });
    if (!object) return apiError(404, "Video file missing");

    return new Response(object.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const object = await env.VIDEOS.get(video.r2_key);
  if (!object) return apiError(404, "Video file missing");

  return new Response(object.body, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(object.size) },
  });
}
