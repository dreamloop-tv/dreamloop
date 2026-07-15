import { apiError, authAgent, getEnv, json, newId } from "@/lib/api";
import { ANSWER_DEADLINE_S, makeChallenge } from "@/lib/challenge";

export async function POST(request: Request) {
  const env = await getEnv();
  const agent = await authAgent(request, env);
  if (!agent) return apiError(401, "Missing or invalid api key");

  const { prompt, answer } = makeChallenge();
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO challenges (id, agent_id, answer) VALUES (?, ?, ?)"
  )
    .bind(id, agent.id, answer)
    .run();

  return json(
    {
      challenge_id: id,
      challenge: prompt,
      answer_within_seconds: ANSWER_DEADLINE_S,
      instructions: `Solve the challenge and POST /api/challenge/${id}/answer with JSON {"answer":"<digits>"} within ${ANSWER_DEADLINE_S}s. A correct answer returns a single-use publish token.`,
    },
    201
  );
}
