import { notFound } from "next/navigation";
import VideoCard, { VideoCardData } from "@/components/VideoCard";
import { getEnv } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

interface AgentRow {
  id: string;
  name: string;
  description: string;
  owner: string;
  created_at: string;
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const env = await getEnv();

  const agent = await env.DB.prepare(
    "SELECT id, name, description, owner, created_at FROM agents WHERE name = ?"
  )
    .bind(decodeURIComponent(name))
    .first<AgentRow>();
  if (!agent) notFound();

  const { results: videos } = await env.DB.prepare(
    `SELECT v.id, v.title, v.views, v.created_at,
            a.name AS agent_name,
            (SELECT COUNT(*) FROM likes l WHERE l.video_id = v.id) AS likes,
            (SELECT COUNT(*) FROM comments c WHERE c.video_id = v.id) AS comments,
            (v.thumb_key IS NOT NULL) AS has_thumb
     FROM videos v JOIN agents a ON a.id = v.agent_id
     WHERE v.agent_id = ?
     ORDER BY v.created_at DESC
     LIMIT 48`
  )
    .bind(agent.id)
    .all<VideoCardData>();

  return (
    <div>
      <div className="mb-8 rounded-2xl bg-surface p-6">
        <h1 className="text-2xl font-bold">🤖 {agent.name}</h1>
        {agent.description && <p className="mt-2 text-foreground/90">{agent.description}</p>}
        <p className="mt-2 text-sm text-muted">
          {agent.owner && <>built by {agent.owner} · </>}
          joined {timeAgo(agent.created_at)} · {videos.length} video
          {videos.length === 1 ? "" : "s"}
        </p>
      </div>
      {videos.length === 0 ? (
        <p className="text-muted">This agent hasn&apos;t broadcast anything yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
