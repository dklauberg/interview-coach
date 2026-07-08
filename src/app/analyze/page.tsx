"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { blobToFloat32 } from "@/lib/audio";
import { loadTranscriber, transcribe } from "@/lib/stt";
import type { CorrectionType } from "@/lib/types";

interface Analysis {
  correctedText: string;
  corrections: {
    original: string;
    correction: string;
    type: CorrectionType;
    explanation: string;
  }[];
  summary: string;
  tips: string[];
}

type Phase = "idle" | "loading" | "transcribing" | "analyzing" | "done";

export default function AnalyzePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setTranscript("");
    setAnalysis(null);

    try {
      // 1. load the local Whisper model (downloads once, then cached)
      setPhase("loading");
      setStatus("Loading the speech model…");
      await loadTranscriber((p) => {
        if (p.status === "progress" && typeof p.progress === "number") {
          setStatus(`Loading the speech model… ${Math.round(p.progress)}%`);
        }
      });

      // 2. decode + transcribe locally
      setPhase("transcribing");
      setStatus("Transcribing your audio locally… (longer clips take a while)");
      const audio = await blobToFloat32(file);
      const text = await transcribe(audio);
      if (!text.trim()) {
        throw new Error(
          "Couldn't hear any speech in that file. Try a clearer English recording.",
        );
      }
      setTranscript(text);

      // 3. correct + analyze with Claude
      setPhase("analyzing");
      setStatus("Correcting and analyzing with AI…");
      const res = await fetch("/api/analyze-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAnalysis(data as Analysis);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const busy = phase === "loading" || phase === "transcribing" || phase === "analyzing";

  return (
    <div className="container">
      <div className="row spread">
        <h1>🎧 Analyze an audio</h1>
        <button className="ghost" onClick={() => router.push("/")}>
          ← Home
        </button>
      </div>
      <p className="subtitle">
        Upload a recording of English speech (you two chatting, a voice note, a
        practice monologue). The app transcribes it on your device and gives you a
        corrected version with explanations.
      </p>

      <div className="card">
        <label>Audio file</label>
        <p className="hint">
          Works with mp3, m4a, wav, ogg, webm. Best for clips up to a few minutes —
          longer files transcribe more slowly. Audio stays on your machine; only the
          text is sent for correction.
        </p>
        <button
          className="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? "Working…" : "Choose an audio file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          style={{ display: "none" }}
          onChange={handleFile}
        />
        {fileName && (
          <p className="hint" style={{ marginTop: 8 }}>
            {fileName}
          </p>
        )}
      </div>

      {busy && (
        <div className="card center">
          <div className="loader" />
          <p>{status}</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {transcript && (
        <div className="card">
          <h2>Raw transcript</h2>
          <p style={{ whiteSpace: "pre-wrap" }} className="muted">
            {transcript}
          </p>
        </div>
      )}

      {analysis && (
        <>
          <div className="card">
            <h2>✅ Corrected version</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{analysis.correctedText}</p>
          </div>

          <div className="card">
            <h2>📝 Feedback</h2>
            <p>{analysis.summary}</p>
            {analysis.tips.length > 0 && (
              <>
                <h2 style={{ fontSize: "1rem", marginTop: 14 }}>Practice next</h2>
                <ul className="clean">
                  {analysis.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="card">
            <h2>English corrections</h2>
            {analysis.corrections.length === 0 && (
              <p className="muted">No notable mistakes found — nice work!</p>
            )}
            {analysis.corrections.map((c, i) => (
              <div key={i} className="correction">
                <div>
                  <span className="orig">{c.original}</span>{" "}
                  <span className="fix">→ {c.correction}</span>
                  <span className="tag">{c.type}</span>
                </div>
                <div className="muted" style={{ fontSize: "0.88rem", marginTop: 4 }}>
                  {c.explanation}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
