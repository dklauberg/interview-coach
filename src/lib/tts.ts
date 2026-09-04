// Natural local text-to-speech via Kokoro (a small neural TTS that runs in the
// browser, like Whisper does for speech-to-text). Free, on-device, and far less
// robotic than the OS voice. Prefers the GPU (WebGPU) so it's fast and doesn't
// freeze the UI; falls back to CPU (wasm), then to the browser's Web Speech
// voice if all else fails — so the app never goes silent.
//
// Two things make it feel like a real interviewer rather than a screen reader:
//
//  1. Sentence streaming. Kokoro synthesizes sentence by sentence and we start
//     playing the first one while the rest is still being generated, so the
//     question begins within ~a second instead of after the whole paragraph.
//  2. Web Audio scheduling. Each sentence is queued on a shared AudioContext at
//     an exact start time, so playback is gapless — no clicking between chunks
//     the way a queue of <audio> elements gives you.

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

/** Voices worth offering. Kokoro ships more; these are the best-graded ones. */
export const VOICES = [
  { id: "af_heart", label: "Heart — US female (warm)" },
  { id: "af_bella", label: "Bella — US female (bright)" },
  { id: "af_nicole", label: "Nicole — US female (soft)" },
  { id: "am_michael", label: "Michael — US male (calm)" },
  { id: "am_fenrir", label: "Fenrir — US male (deep)" },
  { id: "bf_emma", label: "Emma — UK female" },
  { id: "bm_george", label: "George — UK male" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

const DEFAULT_VOICE: VoiceId = "af_heart";
const VOICE_KEY = "interview-coach:voice";
const SPEED_KEY = "interview-coach:speed";

/** Breath-sized gap inserted between sentences (seconds). */
const SENTENCE_GAP = 0.12;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsPromise: Promise<any> | null = null;
let fallbackOnly = false;

let audioCtx: AudioContext | null = null;
let sources: AudioBufferSourceNode[] = [];
/** Bumped on every stop/new utterance; in-flight generation checks it and bails. */
let generation = 0;

export function getVoice(): VoiceId {
  if (typeof localStorage === "undefined") return DEFAULT_VOICE;
  const v = localStorage.getItem(VOICE_KEY) as VoiceId | null;
  return VOICES.some((x) => x.id === v) ? (v as VoiceId) : DEFAULT_VOICE;
}

export function setVoice(v: VoiceId) {
  try {
    localStorage.setItem(VOICE_KEY, v);
  } catch {
    // storage disabled — the choice just won't persist
  }
}

export function getSpeed(): number {
  if (typeof localStorage === "undefined") return 1;
  const n = Number(localStorage.getItem(SPEED_KEY));
  return Number.isFinite(n) && n >= 0.7 && n <= 1.3 ? n : 1;
}

export function setSpeed(n: number) {
  try {
    localStorage.setItem(SPEED_KEY, String(n));
  } catch {
    // storage disabled — the choice just won't persist
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTTS(): Promise<any> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      const hasGPU = typeof navigator !== "undefined" && "gpu" in navigator;
      if (hasGPU) {
        try {
          return await KokoroTTS.from_pretrained(MODEL, {
            dtype: "fp32",
            device: "webgpu",
          });
        } catch {
          // GPU not usable for this model — fall back to CPU below
        }
      }
      return await KokoroTTS.from_pretrained(MODEL, {
        dtype: "q8",
        device: "wasm",
      });
    })();
  }
  return ttsPromise;
}

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

/**
 * Start downloading the voice model early (call when the interview screen opens)
 * and run one tiny synthesis so the first real sentence isn't paying for the
 * lazy graph/kernel warm-up on top of the download.
 */
export function preloadTTS(): Promise<void> {
  return getTTS()
    .then(async (tts) => {
      try {
        await tts.generate("Hello.", { voice: getVoice() });
      } catch {
        // warm-up is best-effort; a failure here doesn't mean speaking will fail
      }
    })
    .catch(() => {
      fallbackOnly = true;
    });
}

/**
 * Rewrite text the way a person would read it aloud. Kokoro pronounces prose
 * well but stumbles on markdown, emoji and written abbreviations — and a
 * sentence with no final punctuation gets a flat, clipped ending.
 */
export function normalizeForSpeech(text: string): string {
  let out = (text || "")
    // markdown emphasis / code ticks the model would otherwise try to voice
    .replace(/[*_`#]+/g, " ")
    // emoji and other pictographs
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    // smart quotes and dashes → plain equivalents
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*[—–]\s*/g, ", ");

  // Written abbreviations read aloud as words.
  const expansions: [RegExp, string][] = [
    [/\be\.?g\.\s*/gi, "for example, "],
    [/\bi\.?e\.\s*/gi, "that is, "],
    [/\betc\.?/gi, "and so on"],
    [/\bvs\.?\b/gi, "versus"],
    [/\bapprox\.?\b/gi, "approximately"],
    [/\bQ&A\b/gi, "Q and A"],
    [/\s&\s/g, " and "],
    [/(\d)\s*%/g, "$1 percent"],
    [/(\w)\/(\w)/g, "$1 or $2"],
  ];
  for (const [re, to] of expansions) out = out.replace(re, to);

  out = out.replace(/\s{2,}/g, " ").trim();
  // A terminal mark gives the last sentence a proper falling intonation.
  if (out && !/[.!?]$/.test(out)) out += ".";
  return out;
}

function fallbackSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.98 * getSpeed();
    // Prefer a real en-US voice when the OS has several installed.
    const preferred = window.speechSynthesis
      .getVoices()
      .find((v) => /en[-_]US/i.test(v.lang) && !/espeak/i.test(v.name));
    if (preferred) u.voice = preferred;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export async function speak(text: string): Promise<void> {
  stopSpeaking();
  const clean = normalizeForSpeech(text);
  if (!clean) return;
  if (fallbackOnly) return fallbackSpeak(clean);

  const myGen = generation;

  try {
    const tts = await getTTS();
    if (myGen !== generation) return; // superseded while the model loaded

    const ctx = getCtx();
    await ctx.resume().catch(() => {});

    // When the next sentence should start. Kept slightly ahead of the clock so
    // synthesis of sentence N+1 overlaps playback of sentence N.
    let cursor = ctx.currentTime + 0.08;
    const finished: Promise<void>[] = [];

    for await (const chunk of tts.stream(clean, {
      voice: getVoice(),
      speed: getSpeed(),
    })) {
      if (myGen !== generation) return; // stopped mid-stream

      const raw = chunk.audio as { audio: Float32Array; sampling_rate: number };
      if (!raw?.audio?.length) continue;

      const buffer = ctx.createBuffer(1, raw.audio.length, raw.sampling_rate);
      // Copy into a plain ArrayBuffer-backed view: Kokoro's output may sit in a
      // SharedArrayBuffer, which copyToChannel doesn't accept.
      buffer.copyToChannel(Float32Array.from(raw.audio), 0);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const startAt = Math.max(cursor, ctx.currentTime + 0.02);
      src.start(startAt);
      cursor = startAt + buffer.duration + SENTENCE_GAP;

      sources.push(src);
      finished.push(new Promise<void>((r) => (src.onended = () => r())));
    }

    if (myGen !== generation || finished.length === 0) return;
    await Promise.all(finished);
  } catch {
    // model failed to load or generate — degrade gracefully, don't break the app
    fallbackOnly = true;
    if (myGen !== generation) return;
    return fallbackSpeak(clean);
  }
}

export function stopSpeaking() {
  generation++;
  for (const src of sources) {
    try {
      src.onended = null;
      src.stop();
    } catch {
      // already finished — nothing to stop
    }
  }
  sources = [];
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
