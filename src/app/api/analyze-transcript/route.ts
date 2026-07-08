import { anthropic, MODELS, extractJson, errorResponse } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = {
  type: "object",
  properties: {
    correctedText: { type: "string" },
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          correction: { type: "string" },
          type: {
            type: "string",
            enum: ["grammar", "vocabulary", "phrasing", "tense", "other"],
          },
          explanation: { type: "string" },
        },
        required: ["original", "correction", "type", "explanation"],
        additionalProperties: false,
      },
    },
    summary: { type: "string" },
    tips: { type: "array", items: { type: "string" } },
  },
  required: ["correctedText", "corrections", "summary", "tips"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();
    if (!transcript || !String(transcript).trim()) {
      return Response.json({ error: "Empty transcript" }, { status: 400 });
    }

    const msg = await anthropic.messages.create({
      model: MODELS.questions,
      max_tokens: 4000,
      thinking: { type: "disabled" },
      system: [
        {
          type: "text",
          text: "You are a friendly English coach. You are given a raw transcript of spoken English (from automatic transcription of an audio recording — it may contain small transcription artifacts). Produce, in ENGLISH:\n\n1) correctedText: a cleaned, corrected, natural-English version of what was said — fix grammar, word choice, verb tenses, and awkward phrasing, while keeping the original meaning and the speaker's voice. Keep it as flowing text/paragraphs. If it reads like a dialogue you may keep line breaks, but do not invent content that isn't in the transcript.\n2) corrections: the most useful specific fixes (aim for the ~8–15 highest-value ones). For each: the original phrase, the corrected version, a type ('grammar' | 'vocabulary' | 'phrasing' | 'tense' | 'other'), and a short plain-language explanation. Skip trivial transcription noise.\n3) summary: 2–3 sentences of encouraging, honest feedback on the speaker's English (fluency, vocabulary, common error patterns).\n4) tips: 2–4 concrete things to practice next.\n\nDo not invent mistakes — only correct what is actually present.",
        },
      ],
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content: `Here is the transcript to correct and analyze:\n\n${transcript}`,
        },
      ],
    });

    return Response.json(extractJson(msg));
  } catch (err) {
    return errorResponse(err);
  }
}
