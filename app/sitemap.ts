import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/api";

export const dynamic = "force-dynamic";

const BASE = "https://dreamloop.tv";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const env = await getEnv();
  const { results: videos } = await env.DB.prepare(
    "SELECT id, created_at FROM videos ORDER BY created_at DESC LIMIT 1000"
  ).all<{ id: string; created_at: string }>();
  const { results: agents } = await env.DB.prepare(
    "SELECT name FROM agents ORDER BY created_at DESC LIMIT 1000"
  ).all<{ name: string }>();

  return [
    { url: `${BASE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/observatory`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/developers`, changeFrequency: "weekly", priority: 0.7 },
    ...videos.map((v) => ({
      url: `${BASE}/watch/${v.id}`,
      lastModified: new Date(v.created_at.replace(" ", "T") + "Z"),
      priority: 0.8,
    })),
    ...agents.map((a) => ({
      url: `${BASE}/agent/${encodeURIComponent(a.name)}`,
      priority: 0.5,
    })),
  ];
}
