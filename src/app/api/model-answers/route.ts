import { MODELS, buildContext, generateJson, errorResponse } from "@/lib/anthropic";
import type { SessionConfig, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          turnIndex: { type: "integer" },
          answer: { type: "string" },
        },
        required: ["turnIndex", "answer"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  try {
    const { config, turns }: { config: SessionConfig; turns: Turn[] } =
      await req.json();

    const questions = turns
      .map((t) => `Turn index ${t.index}: ${t.question}`)
      .join("\n");

    const data = await generateJson<{
      answers: { turnIndex: number; answer: string }[];
    }>({
      model: MODELS.questions,
      maxTokens: 16000,
      effort: "medium",
      schema,
      system: [
        {
          type: "text",
          text: "You are an expert interview coach. For each interview question, write ONE strong example answer (~4–8 sentences) the candidate could realistically give, tailored to their résumé and the target role. Write in the first person as the candidate. Model good structure: use the STAR method (Situation, Task, Action, Result) for behavioral questions, be concrete and specific, and use natural, professional English. Keep it realistic for the stated seniority — not exaggerated.",
        },
        {
          type: "text",
          text: buildContext(config),
          cache_control: { type: "ephemeral" },
        },
      ],
      userMessage: `Write a strong example answer for each of these questions:\n\n${questions}`,
    });

    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
