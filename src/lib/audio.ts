// Microphone recording + decoding to 16 kHz mono Float32 for Whisper.

/**
 * Constraints that matter for recognition quality: the browser's own echo
 * cancellation keeps the interviewer's voice out of the recording, noise
 * suppression removes fan/room hum, and AGC lifts a quiet mic to a usable
 * level — all three are what Whisper is most sensitive to. Mono at 16 kHz is
 * exactly what the model consumes, so nothing is resampled twice.
 */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 16000,
};

/** Opus in WebM is the best-supported container; Safari only offers mp4/AAC. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

// Acquiring the mic takes ~200-500 ms and re-prompts the OS indicator on every
// turn. The interview asks for it once per session and keeps it warm.
let sharedStream: MediaStream | null = null;

async function getStream(): Promise<MediaStream> {
  if (sharedStream && sharedStream.getAudioTracks().some((t) => t.readyState === "live")) {
    return sharedStream;
  }
  sharedStream = await navigator.mediaDevices.getUserMedia({
    audio: AUDIO_CONSTRAINTS,
  });
  return sharedStream;
}

/** Release the microphone (call when leaving the interview screen). */
export function releaseMicrophone() {
  sharedStream?.getTracks().forEach((t) => t.stop());
  sharedStream = null;
}

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private mimeType: string | undefined;

  async start(): Promise<void> {
    const stream = await getStream();
    this.chunks = [];
    this.mimeType = pickMimeType();
    this.mediaRecorder = new MediaRecorder(
      stream,
      this.mimeType ? { mimeType: this.mimeType } : undefined,
    );
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    // Emit a chunk per second so a long answer isn't held in one giant blob.
    this.mediaRecorder.start(1000);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) return reject(new Error("Not recording"));
      this.mediaRecorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: this.mimeType || "audio/webm" }));
        // the stream stays open on purpose — it's reused for the next answer
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
    // Downmix: a stereo capture on one good channel halves in amplitude if you
    // just take channel 0 of a mix, so average whatever channels exist.
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i),
    );
    const mono = new Float32Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      let sum = 0;
      for (const ch of channels) sum += ch[i];
      mono[i] = sum / channels.length;
    }
    // Trim silence first (so the level is measured on speech, not on the tail),
    // then bring a quiet recording up to a level Whisper handles well.
    return normalize(trimSilence(mono));
  } finally {
    await ctx.close();
  }
}

/**
 * Remove DC offset and peak-normalize to about -3 dBFS. Cheap mics and laptop
 * arrays often record at -25 dBFS, which is where Whisper starts dropping short
 * words; scaling up front costs nothing and measurably improves recognition.
 */
export function normalize(audio: Float32Array): Float32Array {
  if (audio.length === 0) return audio;

  let mean = 0;
  for (let i = 0; i < audio.length; i++) mean += audio[i];
  mean /= audio.length;

  let peak = 0;
  for (let i = 0; i < audio.length; i++) {
    const v = Math.abs(audio[i] - mean);
    if (v > peak) peak = v;
  }
  // Essentially silence — leave it alone rather than amplifying the noise floor.
  if (peak < 1e-4) return audio;

  const gain = Math.min(0.707 / peak, 12); // cap the boost so hiss stays down
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) out[i] = (audio[i] - mean) * gain;
  return out;
}

/**
 * Trim leading/trailing silence using an RMS energy gate calibrated to this
 * recording's own noise floor. This both speeds up transcription and prevents
 * Whisper's classic repetition hallucination on silent tails (the recording
 * keeps running between speaking and clicking stop).
 */
export function trimSilence(audio: Float32Array, sampleRate = 16000): Float32Array {
  const win = 512; // ~32 ms windows
  if (audio.length < win * 2) return audio;

  const rms = (start: number) => {
    let sum = 0;
    const n = Math.min(win, audio.length - start);
    for (let j = 0; j < n; j++) {
      const s = audio[start + j];
      sum += s * s;
    }
    return Math.sqrt(sum / Math.max(1, n));
  };

  const frames: number[] = [];
  for (let i = 0; i + win <= audio.length; i += win) frames.push(rms(i));
  if (frames.length === 0) return audio;

  // Noise floor = 20th percentile of frame energy; speech sits well above it.
  // A fixed threshold cut quiet speakers off and let noisy rooms through.
  const sorted = [...frames].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)];
  const loudest = sorted[sorted.length - 1];
  const threshold = Math.max(floor * 3, loudest * 0.06, 0.004);

  const firstFrame = frames.findIndex((f) => f > threshold);
  let lastFrame = -1;
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i] > threshold) {
      lastFrame = i;
      break;
    }
  }
  // detection failed / essentially all silence — return original to be safe
  if (firstFrame < 0 || lastFrame < firstFrame) return audio;

  // keep a little padding so we don't clip the first/last word
  const pad = Math.floor(0.15 * sampleRate);
  const start = Math.max(0, firstFrame * win - pad);
  const end = Math.min(audio.length, (lastFrame + 1) * win + pad);
  return audio.slice(start, end);
}
