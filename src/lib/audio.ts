// Microphone recording + decoding to 16 kHz mono Float32 for Whisper.

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) return reject(new Error("Not recording"));
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }
}

/** Decode a recorded blob into 16 kHz mono Float32 PCM (what Whisper expects). */
export async function blobToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  // Forcing the AudioContext sample rate makes Chrome resample to 16 kHz on decode.
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const channel = decoded.getChannelData(0);
    // copy out before closing the context, then trim silence so Whisper doesn't
    // hallucinate ("da da da…") on trailing silence and runs faster.
    return trimSilence(new Float32Array(channel));
  } finally {
    await ctx.close();
  }
}

/**
 * Trim leading/trailing silence using a simple RMS energy gate. This both speeds
 * up transcription and prevents Whisper's classic repetition hallucination on
 * silent tails (the recording keeps running between speaking and clicking stop).
 */
export function trimSilence(audio: Float32Array, sampleRate = 16000): Float32Array {
  const win = 512; // ~32 ms windows
  const threshold = 0.012; // RMS gate; speech is well above, silence well below
  const rms = (start: number) => {
    let sum = 0;
    const n = Math.min(win, audio.length - start);
    for (let j = 0; j < n; j++) {
      const s = audio[start + j];
      sum += s * s;
    }
    return Math.sqrt(sum / Math.max(1, n));
  };

  let start = 0;
  for (let i = 0; i < audio.length; i += win) {
    if (rms(i) > threshold) {
      start = i;
      break;
    }
  }
  let end = audio.length;
  for (let i = audio.length - win; i >= 0; i -= win) {
    if (rms(i) > threshold) {
      end = i + win;
      break;
    }
  }

  // keep a little padding so we don't clip the first/last word
  const pad = Math.floor(0.15 * sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(audio.length, end + pad);

  // detection failed / essentially all silence — return original to be safe
  if (end <= start) return audio;
  return audio.slice(start, end);
}
