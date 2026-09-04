import Anthropic from "@anthropic-ai/sdk";
import type { SessionConfig } from "./types";

// Retries cover the transient 429/5xx blips; the long timeout is the safety net
// for the report, which is the slowest call in the app.
export const anthropic = new Anthropic({
  maxRetries: 3,
  timeout: 10 * 60 * 1000,
});

// One model for the whole app: Claude Opus 5. Thinking is on by default there,
// so instead of switching models for speed we switch *effort* per route —
// "low" for the live interview (latency matters), "high" for the final report
// (quality matters). That keeps a single prompt-cache namespace too.
export const MODELS = {
  questions: "claude-opus-5",
  report: "claude-opus-5",
} as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Stable block fed into the system prompt. Kept byte-identical across a session
 * so it can be prompt-cached (résumé + JD + context are the big, reused chunk).
 */
export function buildContext(config: SessionConfig): string {
  const clar =
    config.clarifications
      ?.filter((c) => c.answer?.trim())
      .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
      .join("\n\n") || "None provided.";

  return [
    `# Target role — job description`,
    config.jobDescription || "(not provided)",
    ``,
    `# Candidate résumé`,
    config.resumeText || "(not provided)",
    ``,
    `# Additional candidate context`,
    clar,
    ``,
    `# Seniority level`,
    config.level || "Not specified",
  ].join("\n");
}

export function extractJson<T>(msg: Anthropic.Message): T {
  // With adaptive thinking the response starts with thinking blocks; the JSON
  // answer is the first *text* block.
  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Model returned no text content");
  }
  return JSON.parse(block.text) as T;
}

/**
 * Every route in this app does the same thing: one request, structured JSON out.
 * Streaming is used throughout — it's what keeps a long report from tripping the
 * SDK's HTTP timeout, and it costs nothing on the short calls.
 */
export async function generateJson<T>(opts: {
  model: string;
  maxTokens: number;
  effort: Effort;
  system: Anthropic.TextBlockParam[];
  schema: Record<string, unknown>;
  userMessage: string;
}): Promise<T> {
  const msg = await anthropic.messages
    .stream({
      model: opts.model,
      max_tokens: opts.maxTokens,
      thinking: { type: "adaptive" },
      output_config: {
        effort: opts.effort,
        format: { type: "json_schema", schema: opts.schema },
      },
      system: opts.system,
      messages: [{ role: "user", content: opts.userMessage }],
    })
    .finalMessage();

  if (msg.stop_reason === "refusal") {
    throw new Error(
      "The model declined to answer this request. Try rephrasing the résumé or job description.",
    );
  }
  return extractJson<T>(msg);
}

export function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  const isAuth =
    err instanceof Anthropic.AuthenticationError ||
    message.toLowerCase().includes("api key") ||
    message.toLowerCase().includes("authentication");
  const isRateLimit = err instanceof Anthropic.RateLimitError;

  return Response.json(
    {
      error: isAuth
        ? "Missing or invalid ANTHROPIC_API_KEY. Copy .env.local.example to .env.local and add your key."
        : isRateLimit
          ? "The Anthropic API is rate-limiting this key right now. Wait a few seconds and try again."
          : message,
    },
    { status: isAuth ? 401 : isRateLimit ? 429 : 500 },
  );
}
