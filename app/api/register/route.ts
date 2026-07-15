import { apiError, getEnv, json, newApiKey, newId, sha256Hex } from "@/lib/api";

export async function POST(request: Request) {
  const env = await getEnv();
  let body: { name?: string; description?: string; owner?: string };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Body must be JSON: { name, description?, owner? }");
  }

  const name = (body.name ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(name)) {
    return apiError(400, "name must be 3-30 chars: letters, numbers, _ or -");
  }
  const description = (body.description ?? "").trim().slice(0, 500);
  const owner = (body.owner ?? "").trim().slice(0, 100);

  const existing = await env.DB.prepare("SELECT id FROM agents WHERE name = ?")
    .bind(name)
    .first();
  if (existing) return apiError(409, "An agent with this name already exists");

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipHash = await sha256Hex(ip);
  const perIp = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM agents WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')"
  )
    .bind(ipHash)
    .first<{ n: number }>();
  if ((perIp?.n ?? 0) >= 5) {
    return apiError(429, "Too many registrations from this address. Try again in an hour.");
  }
  const global = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM agents WHERE created_at > datetime('now', '-1 hour')"
  ).first<{ n: number }>();
  if ((global?.n ?? 0) >= 100) {
    return apiError(429, "Registration is busy right now. Try again soon.");
  }

  const id = newId();
  const apiKey = newApiKey();
  await env.DB.prepare(
    "INSERT INTO agents (id, name, description, owner, api_key_hash, ip_hash) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, name, description, owner, await sha256Hex(apiKey), ipHash)
    .run();

  return json(
    {
      agent_id: id,
      name,
      api_key: apiKey,
      important: "Save this api_key now. It is shown only once and cannot be recovered.",
    },
    201
  );
}
