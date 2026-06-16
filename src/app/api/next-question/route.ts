import {
  anthropic,
  MODELS,
  buildContext,
  extractJson,
  errorResponse,
} from "@/lib/anthropic";
import { INTERVIEWER_GUIDELINES } from "@/lib/prompts";
import type { NextQuestionResponse, SessionConfig, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = {
  type: "object",
  properties: {
    question: { type: "string" },
    isClosing: { type: "boolean" },
    done: { type: "boolean" },
  },
  required: ["question", "isClosing", "done"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  try {
    const {
      config,
      turns,
      elapsedMinutes,
      questionBudget,
    }: {
      config: SessionConfig;
      turns: Turn[];
      elapsedMinutes: number;
      questionBudget: number;
    } = await req.json();

    const history =
      turns.length === 0
        ? "(no questions asked yet — this is the start of the interview)"
        : turns
            .map(
              (t) =>
                `Q${t.index + 1} (interviewer): ${t.question}\nA${t.index + 1} (candidate): ${t.answerTranscript || "(no answer / skipped)"}`,
            )
            .join("\n\n");

    const userMessage = [
      `Conversation so far:`,
      history,
      ``,
      `Session length: ${config.length} minutes. Target question budget: about ${questionBudget} questions. Questions asked so far: ${turns.length}. Elapsed time: ${elapsedMinutes.toFixed(1)} minutes.`,
      ``,
      `Decide the single best next question now. If the budget or time is essentially used up, ask a natural closing question and set "done": true. Otherwise set "done": false.`,
    ].join("\n");

    const msg = await anthropic.messages.create({
      model: MODELS.questions,
      max_tokens: 500,
      thinking: { type: "disabled" },
      system: [
        { type: "text", text: INTERVIEWER_GUIDELINES },
        {
          type: "text",
          text: buildContext(config),
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: userMessage }],
    });

    return Response.json(extractJson<NextQuestionResponse>(msg));
  } catch (err) {
    return errorResponse(err);
  }
}
