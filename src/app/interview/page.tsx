"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Recorder, blobToFloat32 } from "@/lib/audio";
import { transcribe, loadTranscriber } from "@/lib/stt";
import { speak, stopSpeaking } from "@/lib/tts";
import type { Turn } from "@/lib/types";

type Phase =
  | "loading"
  | "ready" // question shown, waiting for user to start answering
  | "recording"
  | "transcribing"
  | "finishing";

export default function InterviewPage() {
  const router = useRouter();
  const config = useStore((s) => s.config);
  const turns = useStore((s) => s.turns);
  const addTurn = useStore((s) => s.addTurn);

  const [phase, setPhase] = useState<Phase>("loading");
  const [question, setQuestion] = useState("");
  const [modelStatus, setModelStatus] = useState("Loading speech model…");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);

  const recorderRef = useRef<Recorder | null>(null);
  const startRef = useRef<number>(0);
  const answerStartRef = useRef<number>(0);
  const turnsRef = useRef<Turn[]>([]);
  const startedRef = useRef(false);

  const questionBudget = config ? (config.length === 30 ? 12 : 6) : 6;

  const finishSession = useCallback(() => {
    stopSpeaking();
    router.push("/report");
  }, [router]);

  const askNext = useCallback(
    async (history: Turn[]) => {
      if (!config) return;
      setPhase("finishing");
      const elapsedMinutes = (Date.now() - startRef.current) / 60000;

      // hard safety caps so a session can't run away
      if (elapsedMinutes >= config.length + 1 || history.length >= 20) {
        finishSession();
        return;
      }

      try {
        const res = await fetch("/api/next-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config,
            turns: history,
            elapsedMinutes,
            questionBudget,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to get question");

        setQuestion(data.question);
        setPhase("ready");
        speak(data.question);

        // If the model wrapped up but we still have a question to show,
        // play it, then end after this final (optional) answer.
        if (data.done) {
          // mark so the next "finish answer" ends the session
          (turnsRef as { closing?: boolean } & typeof turnsRef).closing = true;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("ready");
      }
    },
    [config, questionBudget, finishSession],
  );

  // init
  useEffect(() => {
    if (!config) {
      router.replace("/");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    turnsRef.current = [];
    startRef.current = Date.now();

    // warm the TTS voices list
    if (typeof window !== "undefined") window.speechSynthesis?.getVoices();

    // preload Whisper, then ask the first question
    loadTranscriber((p) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        setModelStatus(`Loading speech model… ${Math.round(p.progress)}%`);
      } else if (p.status === "ready" || p.status === "done") {
        setModelStatus("");
      }
    })
      .then(() => askNext([]))
      .catch((err) => {
        setError(
          "Could not load the local speech model. Check your internet connection (it only downloads once). " +
            (err instanceof Error ? err.message : ""),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // countdown timer
  useEffect(() => {
    if (!config) return;
    const total = config.length * 60;
    const id = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      setRemaining(Math.max(0, Math.round(total - elapsed)));
    }, 1000);
    return () => clearInterval(id);
  }, [config]);

  async function startAnswering() {
    setError("");
    stopSpeaking();
    try {
      const rec = new Recorder();
      await rec.start();
      recorderRef.current = rec;
      answerStartRef.current = Date.now();
      setPhase("recording");
    } catch {
      setError("Microphone access denied. Please allow the mic and try again.");
    }
  }

  async function finishAnswer() {
    if (!recorderRef.current) return;
    setPhase("transcribing");
    try {
      const blob = await recorderRef.current.stop();
      recorderRef.current = null;
      const audio = await blobToFloat32(blob);
      const text = await transcribe(audio);

      const index = turnsRef.current.length;
      const endedAt = Date.now();
      const turn: Turn = {
        index,
        question,
        answerTranscript: text,
        audioUrl: URL.createObjectURL(blob),
        startedAt: answerStartRef.current,
        endedAt,
        durationMs: answerStartRef.current ? endedAt - answerStartRef.current : undefined,
      };
      turnsRef.current = [...turnsRef.current, turn];
      addTurn(turn);

      const closing = (turnsRef as { closing?: boolean }).closing;
      if (closing) {
        finishSession();
        return;
      }
      await askNext(turnsRef.current);
    } catch (err) {
      setError(
        "Transcription failed: " +
          (err instanceof Error ? err.message : String(err)),
      );
      setPhase("ready");
    }
  }

  if (!config) return null;

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const timeStr = `${mm}:${ss.toString().padStart(2, "0")}`;
  const timeLow = remaining <= 60;

  return (
    <div className="container">
      <div className="row spread">
        <div>
          <strong>{config.profile}</strong>{" "}
          <span className="muted">· {config.level} · mock interview</span>
        </div>
        <div className={`timer ${timeLow ? "" : ""}`} style={timeLow ? { color: "var(--warning)" } : undefined}>
          ⏱ {timeStr}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 6 }}>
        Question {turns.length + (phase === "ready" || phase === "recording" ? 1 : 0)} · target ~{questionBudget}
      </p>

      {phase === "loading" ? (
        <div className="card center">
          <div className="loader" />
          <p>{modelStatus || "Preparing…"}</p>
          <p className="hint">
            The first time, Whisper (the local speech recognizer) downloads to your
            browser. It is cached afterwards.
          </p>
        </div>
      ) : (
        <>
          <div className="question-box">
            {question || "…"}
            {phase === "ready" && (
              <button
                className="ghost"
                style={{ display: "block", marginTop: 12 }}
                onClick={() => speak(question)}
              >
                🔊 Replay question
              </button>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          {phase === "ready" && (
            <button className="record-btn" onClick={startAnswering}>
              🎤 Start answering
            </button>
          )}

          {phase === "recording" && (
            <button className="record-btn recording" onClick={finishAnswer}>
              ⏹ Finish answer
            </button>
          )}

          {phase === "transcribing" && (
            <div className="card center">
              <div className="loader" />
              <p>Transcribing your answer locally…</p>
            </div>
          )}

          {phase === "finishing" && (
            <div className="card center">
              <div className="loader" />
              <p>The interviewer is thinking…</p>
            </div>
          )}

          <div className="row" style={{ marginTop: 20 }}>
            <button className="secondary" onClick={() => finishSession()}>
              End interview &amp; see feedback
            </button>
          </div>
        </>
      )}

      {turns.length > 0 && (
        <div className="card" style={{ marginTop: 28 }}>
          <h2>Transcript so far</h2>
          {turns.map((t) => (
            <div key={t.index} className="transcript-turn">
              <div className="q">Q: {t.question}</div>
              <div className="a">A: {t.answerTranscript || "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
