// Natural local text-to-speech via Kokoro (a small neural TTS that runs in the
// browser, like Whisper does for speech-to-text). Free, on-device, and far less
// robotic than the OS voice. Prefers the GPU (WebGPU) so it's fast and doesn't
// freeze the UI; falls back to CPU (wasm), then to the browser's Web Speech
// voice if all else fails — so the app never goes silent.

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsPromise: Promise<any> | null = null;
let currentAudio: HTMLAudioElement | null = null;
let fallbackOnly = false;

// Kokoro voices: af_heart / af_bella (US female), am_michael / am_adam (US male),
// bf_emma (UK female), bm_george (UK male). Change here to taste.
const VOICE = "af_heart";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTTS(): Promise<any> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      const hasGPU =
        typeof navigator !== "undefined" && "gpu" in navigator;
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

/** Start downloading the voice model early (call when the interview screen opens). */
export function preloadTTS() {
  getTTS().catch(() => {
    fallbackOnly = true;
  });
}

function fallbackSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.98;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export async function speak(text: string): Promise<void> {
  stopSpeaking();
  if (!text?.trim()) return;
  if (fallbackOnly) return fallbackSpeak(text);

  try {
    const tts = await getTTS();
    const audioData = await tts.generate(text, { voice: VOICE });
    const blob: Blob = audioData.toBlob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.play().catch(() => resolve());
    });
  } catch {
    // model failed to load or generate — degrade gracefully, don't break the app
    fallbackOnly = true;
    return fallbackSpeak(text);
  }
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
