export type SessionLength = 15 | 30;

export interface ClarifyQA {
  question: string;
  answer: string;
}

export interface SessionConfig {
  profile: string;
  jobDescription: string;
  resumeText: string;
  length: SessionLength;
  level: string; // e.g. "Junior", "Mid", "Senior"
  clarifications: ClarifyQA[];
}

export interface Turn {
  index: number;
  question: string;
  answerTranscript: string;
  /** in-memory only; not persisted across reloads */
  audioUrl?: string;
  startedAt?: number;
  endedAt?: number;
  /** length of the recorded answer in milliseconds (for WPM) */
  durationMs?: number;
}

export type CorrectionType =
  | "grammar"
  | "vocabulary"
  | "phrasing"
  | "tense"
  | "other";

export interface CorrectionItem {
  turnIndex: number;
  original: string;
  correction: string;
  type: CorrectionType;
  explanation: string;
}

export interface Scores {
  technique: number; // content quality, relevance, STAR usage
  clarity: number; // structure, coherence, conciseness
  wordUsage: number; // vocabulary, grammar, naturalness, professional tone
  overall: number;
}

export interface Report {
  scores: Scores;
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections: CorrectionItem[];
  actions: string[];
}

export interface SavedSession {
  id: string;
  profile: string;
  createdAt: number;
  config: SessionConfig;
  turns: Turn[];
  report?: Report;
}

export interface NextQuestionResponse {
  question: string;
  isClosing: boolean;
  done: boolean;
}
