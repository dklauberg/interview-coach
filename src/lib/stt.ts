// Local speech-to-text via Whisper running in the browser (transformers.js).
// The model (~150 MB for whisper-base.en) downloads once on first use and is
// cached by the browser. After that, transcription runs fully on-device — no
// audio ever leaves the machine, and there is no per-use cost.
//
// Prefers the GPU (WebGPU) so transcription is fast and doesn't freeze the UI;
// falls back to CPU (wasm) on machines without WebGPU.

type ProgressCb = (p: { status: string; progress?: number; file?: string }) => void;

const MODEL = "Xenova/whisper-base.en";

let transcriberPromise: Promise<unknown> | null = null;

export function loadTranscriber(onProgress?: ProgressCb): Promise<unknown> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const hasGPU = typeof navigator !== "undefined" && "gpu" in navigator;
      if (hasGPU) {
        try {
          return await pipeline("automatic-speech-recognition", MODEL, {
            device: "webgpu",
            dtype: "fp32",
            progress_callback: onProgress as never,
          });
        } catch {
          // GPU not usable — fall back to CPU below
        }
      }
      return await pipeline("automatic-speech-recognition", MODEL, {
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
