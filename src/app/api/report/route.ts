import { MODELS, buildContext, generateJson, errorResponse } from "@/lib/anthropic";
import { REPORT_RUBRIC } from "@/lib/prompts";
import type { Report, SessionConfig, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: {
        technique: { type: "integer" },
        clarity: { type: "integer" },
        wordUsage: { type: "integer" },
        overall: { type: "integer" },
      },
      required: ["technique", "clarity", "wordUsage", "overall"],
      additionalProperties: false,
    },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          turnIndex: { type: "integer" },
          original: { type: "string" },
          correction: { type: "string" },
          type: {
            type: "string",
            enum: ["grammar", "vocabulary", "phrasing", "tense", "other"],
          },
          explanation: { type: "string" },
        },
        required: ["turnIndex", "original", "correction", "type", "explanation"],
        additionalProperties: false,
      },
    },
    actions: { type: "array", items: { type: "string" } },
  },
  required: ["scores", "summary", "strengths", "improvements", "corrections", "actions"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  try {
    const { config, turns }: { config: SessionConfig; turns: Turn[] } =
      await req.json();

    const transcript = turns
      .map(
        (t) =>
          `--- Turn index ${t.index} ---\nInterviewer: ${t.question}\nCandidate: ${t.answerTranscript || "(no answer)"}`,
      )
      .join("\n\n");

    // The report is the one place where quality clearly beats latency: it scores
    // the session and produces the English corrections the user learns from.
    const data = await generateJson<Report>({
      model: MODELS.report,
      maxTokens: 16000,
      effort: "high",
      schema,
      system: [
        { type: "text", text: REPORT_RUBRIC },
        {
          type: "text",
          text: buildContext(config),
          cache_control: { type: "ephemeral" },
        },
      ],
      userMessage: `Here is the full interview transcript. Evaluate it per your instructions.\n\n${transcript}`,
    });

    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
