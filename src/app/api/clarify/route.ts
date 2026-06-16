import { anthropic, MODELS, extractJson, errorResponse } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = {
  type: "object",
  properties: {
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["questions"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  try {
    const { resumeText, jobDescription } = await req.json();

    const msg = await anthropic.messages.create({
      model: MODELS.questions,
      max_tokens: 800,
      thinking: { type: "disabled" },
      system: [
        {
          type: "text",
          text: "You are an expert interview coach preparing a tailored mock interview. Based on the résumé and the target job description, list 3 to 5 short, specific clarifying questions you would want the candidate to answer first, so the interview is well-targeted (e.g. motivation for the role, employment gaps, a specific project, target company, or relocation). Keep each question under 20 words and avoid questions already answered by the résumé.",
        },
      ],
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content: `RÉSUMÉ:\n${resumeText || "(not provided)"}\n\nJOB DESCRIPTION:\n${jobDescription || "(not provided)"}`,
        },
      ],
    });

    return Response.json(extractJson<{ questions: string[] }>(msg));
  } catch (err) {
    return errorResponse(err);
  }
}
