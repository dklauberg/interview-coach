import Anthropic from "@anthropic-ai/sdk";
import type { SessionConfig } from "./types";

export const anthropic = new Anthropic();

// Sonnet drives the live interview (fast, cheap, very capable).
// Opus writes the final report + scoring, where feedback quality matters most.
export const MODELS = {
  questions: "claude-sonnet-4-6",
  report: "claude-opus-4-8",
} as const;

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
  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Model returned no text content");
  }
  return JSON.parse(block.text) as T;
}

export function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  const isAuth =
    message.toLowerCase().includes("api key") ||
    message.toLowerCase().includes("authentication");
  return Response.json(
    {
      error: isAuth
        ? "Missing or invalid ANTHROPIC_API_KEY. Copy .env.local.example to .env.local and add your key."
        : message,
    },
    { status: isAuth ? 401 : 500 },
  );
}
