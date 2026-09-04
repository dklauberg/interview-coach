// Local speech-to-text via Whisper running in the browser (transformers.js).
// The model (~80 MB for whisper-base.en) downloads once on first use and is
// cached by the browser. After that, transcription runs fully on-device — no
// audio ever leaves the machine, and there is no per-use cost.
//
// Runs on the CPU (wasm). This is the reliable path: Whisper on WebGPU can hang
// on some machines, so we keep transcription on wasm even though the voice (TTS)
// uses WebGPU. Transcription shows a spinner while it runs.

type ProgressCb = (p: { status: string; progress?: number; file?: string }) => void;

// base.en is the accuracy/speed sweet spot on a laptop CPU. If you have a fast
// machine and want better recognition of accented English, set
// NEXT_PUBLIC_WHISPER_MODEL=Xenova/whisper-small.en (~3x slower, ~240 MB).
const MODEL = process.env.NEXT_PUBLIC_WHISPER_MODEL || "Xenova/whisper-base.en";

/** Whisper needs ~0.4 s of speech before its output is worth trusting. */
const MIN_SAMPLES = 16000 * 0.4;

let transcriberPromise: Promise<unknown> | null = null;

export function loadTranscriber(onProgress?: ProgressCb): Promise<unknown> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("automatic-speech-recognition", MODEL, {
        device: "wasm",
        progress_callback: onProgress as never,
      });
    })();
  }
  return transcriberPromise;
}

export async function transcribe(
  audio: Float32Array,
  onProgress?: ProgressCb,
): Promise<string> {
  if (audio.length < MIN_SAMPLES) return "";

  const transcriber = (await loadTranscriber(onProgress)) as (
    audio: Float32Array,
    opts: Record<string, unknown>,
  ) => Promise<{ text: string }>;

  const result = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    // Greedy decoding is both faster and less prone to the looping
    // hallucination than sampling; the n-gram block is a second guard against
    // "and then and then and then…" on hesitant speech.
    do_sample: false,
    num_beams: 1,
    no_repeat_ngram_size: 4,
    return_timestamps: false,
  });
  return cleanTranscript(result.text || "");
}

/** Phrases Whisper emits when it hears nothing useful (training-data artifacts). */
const HALLUCINATED = [
  /^\s*(thanks? for watching|thank you for watching)[.!]?\s*$/i,
  /^\s*\(?\s*(music|silence|applause|blank_audio|inaudible)\s*\)?[.!]?\s*$/i,
  /^\s*you\s*$/i,
  /^\s*\.\s*$/,
];

/**
 * Post-processing safety net: strip Whisper's bracketed sound tags, collapse a
 * word repeated 3+ times in a row (e.g. "da da da da…"), and drop the stock
 * phrases it falls back on when the audio carries no speech.
 */
export function cleanTranscript(text: string): string {
  const out = text
    .replace(/[[(]\s*(BLANK_AUDIO|MUSIC|SILENCE|APPLAUSE|INAUDIBLE)\s*[\])]/gi, " ")
    .replace(/\b(\w+)(\s+\1\b){2,}/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  return HALLUCINATED.some((re) => re.test(out)) ? "" : out;
}
