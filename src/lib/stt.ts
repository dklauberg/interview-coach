// Local speech-to-text via Whisper running in the browser (transformers.js).
// The model (~80 MB for whisper-base.en) downloads once on first use and is
// cached by the browser. After that, transcription runs fully on-device — no
// audio ever leaves the machine, and there is no per-use cost.
//
// Runs on the CPU (wasm). This is the reliable path: Whisper on WebGPU can hang
// on some machines, so we keep transcription on wasm even though the voice (TTS)
// uses WebGPU. Transcription shows a spinner while it runs.

type ProgressCb = (p: { status: string; progress?: number; file?: string }) => void;

const MODEL = "Xenova/whisper-base.en";

let transcriberPromise: Promise<unknown> | null = null;

export function loadTranscriber(onProgress?: ProgressCb): Promise<unknown> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("automatic-speech-recognition", MODEL, {
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
  const transcriber = (await loadTranscriber(onProgress)) as (
    audio: Float32Array,
    opts: Record<string, unknown>,
  ) => Promise<{ text: string }>;

  const result = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return (result.text || "").trim();
}
