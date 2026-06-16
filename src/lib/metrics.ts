import type { Turn, SavedSession } from "./types";

// Curated list of common spoken fillers / hedges. Multi-word phrases first.
const FILLERS = [
  "you know",
  "i mean",
  "kind of",
  "sort of",
  "stuff like that",
  "um",
  "uh",
  "uhm",
  "erm",
  "hmm",
  "like",
  "basically",
  "actually",
  "literally",
];

export function wordCount(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function countFillers(text: string): { total: number; byWord: Record<string, number> } {
  const lower = ` ${(text || "").toLowerCase()} `;
  const byWord: Record<string, number> = {};
  let total = 0;
  for (const f of FILLERS) {
    // word-boundary match, case-insensitive, whole tokens/phrases only
    const re = new RegExp(`(?<![\\p{L}])${escapeRe(f)}(?![\\p{L}])`, "giu");
    const matches = lower.match(re);
    const n = matches ? matches.length : 0;
    if (n > 0) {
      byWord[f] = n;
      total += n;
    }
  }
  return { total, byWord };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface DeliveryStats {
  totalWords: number;
  totalFillers: number;
  /** words per minute across all answers that have a measured duration */
  avgWpm: number;
  /** fillers per 100 words */
  fillerRate: number;
  fillerBreakdown: Record<string, number>;
  perTurn: { index: number; words: number; wpm: number | null; fillers: number }[];
}

export function computeDelivery(turns: Turn[]): DeliveryStats {
  let totalWords = 0;
  let totalFillers = 0;
  let timedWords = 0;
  let timedMs = 0;
  const fillerBreakdown: Record<string, number> = {};
  const perTurn: DeliveryStats["perTurn"] = [];

  for (const t of turns) {
    const words = wordCount(t.answerTranscript);
    const { total, byWord } = countFillers(t.answerTranscript);
    totalWords += words;
    totalFillers += total;
    for (const [k, v] of Object.entries(byWord)) {
      fillerBreakdown[k] = (fillerBreakdown[k] || 0) + v;
    }
    let wpm: number | null = null;
    if (t.durationMs && t.durationMs > 1000 && words > 0) {
      wpm = Math.round(words / (t.durationMs / 60000));
      timedWords += words;
      timedMs += t.durationMs;
    }
    perTurn.push({ index: t.index, words, wpm, fillers: total });
  }

  const avgWpm = timedMs > 0 ? Math.round(timedWords / (timedMs / 60000)) : 0;
  const fillerRate = totalWords > 0 ? Math.round((totalFillers / totalWords) * 1000) / 10 : 0;

  return { totalWords, totalFillers, avgWpm, fillerRate, fillerBreakdown, perTurn };
}

/** Heuristic label for speaking pace. */
export function paceLabel(wpm: number): string {
  if (wpm === 0) return "—";
  if (wpm < 110) return "a bit slow";
  if (wpm <= 160) return "good pace";
  if (wpm <= 185) return "slightly fast";
  return "too fast";
}

export function sessionDelivery(s: SavedSession): DeliveryStats {
  return computeDelivery(s.turns);
}
