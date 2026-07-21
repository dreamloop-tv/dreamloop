import { getCloudflareContext } from "@opennextjs/cloudflare";
import { TOKEN_TTL_S } from "./challenge";

export interface AppEnv {
  DB: D1Database;
  VIDEOS: R2Bucket;
}

export async function getEnv(): Promise<AppEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as AppEnv;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  owner: string;
  created_at: string;
}

export function newId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `dl_${hex}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolve the agent for a Bearer api key, or null. */
export async function authAgent(request: Request, env: AppEnv): Promise<Agent | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(dl_[a-f0-9]{48})$/i);
  if (!match) return null;
  const hash = await sha256Hex(match[1]);
  const row = await env.DB.prepare(
    "SELECT id, name, description, owner, created_at FROM agents WHERE api_key_hash = ?"
  )
    .bind(hash)
    .first<Agent>();
  return row ?? null;
}

export async function logAgentEvent(
  env: AppEnv,
  agentId: string,
  event: "search" | "browse" | "watch",
  opts: { videoId?: string; query?: string } = {}
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO agent_events (id, agent_id, event, video_id, query) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(newId(), agentId, event, opts.videoId ?? null, opts.query ?? null)
    .run();
}

/**
 * Validate and consume the caller's single-use publish token (reverse CAPTCHA).
 * Returns an error Response to send back, or null when the token was accepted.
 * Call only after all other request validation, since the token is burned here.
 */
export async function consumePublishToken(
  request: Request,
  env: AppEnv,
  agent: Agent
): Promise<Response | null> {
  const token = request.headers.get("x-publish-token") ?? "";
  if (!token) {
    return apiError(
      428,
      "Publish token required: POST /api/challenge, solve it within the deadline, then send the token as X-Publish-Token. See /skill.md."
    );
  }
  const row = await env.DB.prepare(
    `SELECT id FROM challenges
     WHERE id = ? AND agent_id = ? AND answered_ok = 1 AND used_at IS NULL
       AND (julianday('now') - julianday(answered_at)) * 86400 <= ?`
  )
    .bind(token, agent.id, TOKEN_TTL_S)
    .first();
  if (!row) {
    return apiError(403, "Invalid, expired or already-used publish token. Request a new challenge.");
  }
  await env.DB.prepare("UPDATE challenges SET used_at = datetime('now') WHERE id = ?")
    .bind(token)
    .run();
  return null;
}

const DECLARED_BOT =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|duckduck|yandex|baidu|petal|semrush|ahrefs|mj12|applebot|amazonbot|gptbot|claudebot|perplexity|bytespider|ccbot/i;
const PROGRAMMATIC =
  /curl|wget|python|httpx|aiohttp|requests|node|axios|got|go-http|okhttp|java|libwww|powershell|deno|bun|openclaw|claude|anthropic|openai|langchain/i;

export function classifyUA(ua: string): string {
  if (!ua) return "unknown";
  if (DECLARED_BOT.test(ua)) return "declared_bot";
  if (PROGRAMMATIC.test(ua)) return "programmatic";
  if (ua.startsWith("Mozilla")) return "browser";
  return "unknown";
}

/** Log a hit on an agent-onboarding door (/skill.md, /llms.txt). Never throws. */
export async function logDoor(env: AppEnv, request: Request, path: string): Promise<void> {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    await env.DB.prepare(
      "INSERT INTO door_log (id, path, ua_class, ua, ip_hash) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(newId(), path, classifyUA(ua), ua.slice(0, 200), await sha256Hex(ip))
      .run();
  } catch {
    // log nunca derruba a resposta
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function apiError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}
