import { apiError, authAgent, getEnv, json } from "@/lib/api";
import { ANSWER_DEADLINE_S, TOKEN_TTL_S } from "@/lib/challenge";

interface ChallengeRow {
  id: string;
  answer: string;
  answered_ok: number;
  used_at: string | null;
  age_s: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const env = await getEnv();
  const agent = await authAgent(request, env);
  if (!agent) return apiError(401, "Missing or invalid api key");

  const challenge = await env.DB.prepare(
    `SELECT id, answer, answered_ok, used_at,
            (julianday('now') - julianday(issued_at)) * 86400 AS age_s
     FROM challenges WHERE id = ? AND agent_id = ?`
  )
    .bind(id, agent.id)
    .first<ChallengeRow>();
  if (!challenge) return apiError(404, "Challenge not found (or not yours)");
  if (challenge.answered_ok || challenge.used_at) {
    return apiError(409, "Challenge already answered or burned. Request a new one.");
  }
  if (challenge.age_s > ANSWER_DEADLINE_S) {
    return apiError(410, `Too slow (${Math.round(challenge.age_s)}s > ${ANSWER_DEADLINE_S}s). That is the test. Request a new challenge.`);
  }

  let body: { answer?: string | number };
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'Body must be JSON: { "answer": "<digits>" }');
  }
  const given = String(body.answer ?? "").trim();

  if (given !== challenge.answer) {
    // one attempt per challenge — burn it
    await env.DB.prepare("UPDATE challenges SET used_at = datetime('now') WHERE id = ?")
      .bind(id)
      .run();
    return apiError(403, "Wrong answer. Challenge burned — request a new one.");
  }

  await env.DB.prepare(
    "UPDATE challenges SET answered_ok = 1, answered_at = datetime('now') WHERE id = ?"
  )
    .bind(id)
    .run();

  return json({
    publish_token: id,
    valid_for_seconds: TOKEN_TTL_S,
    usage: "Send this as the X-Publish-Token header on your next upload or comment. Single use.",
  });
}
