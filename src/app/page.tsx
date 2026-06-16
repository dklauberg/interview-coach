"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import type { ClarifyQA, SessionLength } from "@/lib/types";

export default function SetupPage() {
  const router = useRouter();
  const { profile, setProfile, startSession, sessions, deleteSession } =
    useStore();

  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [level, setLevel] = useState("Mid");
  const [length, setLength] = useState<SessionLength>(15);
  const [clarifications, setClarifications] = useState<ClarifyQA[]>([]);
  const [loadingClarify, setLoadingClarify] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    setName(useStore.getState().profile || "");
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse file");
      setResumeText(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function getClarifications() {
    setLoadingClarify(true);
    setError("");
    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setClarifications(
        (data.questions as string[]).map((q) => ({ question: q, answer: "" })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingClarify(false);
    }
  }

  function start() {
    if (!jobDescription.trim()) {
      setError("Please add the job description first.");
      return;
    }
    const profileName = name.trim() || "Guest";
    setProfile(profileName);
    startSession({
      profile: profileName,
      resumeText,
      jobDescription,
      level,
      length,
      clarifications,
    });
    router.push("/interview");
  }

  if (!mounted) return null;

  return (
    <div className="container">
      <h1>🎙️ Interview Coach</h1>
      <p className="subtitle">
        Practice job interviews in English by voice. Speak your answers, then get
        a full transcript, English corrections, and a scored feedback report.
      </p>

      <div className="card">
        <label>Who is practicing?</label>
        <p className="hint">Used to track your progress over time.</p>
        <input
          type="text"
          value={name}
          placeholder="Your name"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="card">
        <label>Your résumé / background</label>
        <p className="hint">
          Paste it, or upload a PDF / DOCX. This stays on your machine except for
          generating the interview.
        </p>
        <div className="row" style={{ marginBottom: 10 }}>
          <button
            className="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? "Reading file…" : "Upload PDF / DOCX"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </div>
        <textarea
          rows={6}
          value={resumeText}
          placeholder="Paste your résumé text here…"
          onChange={(e) => setResumeText(e.target.value)}
        />
      </div>

      <div className="card">
        <label>Job description</label>
        <p className="hint">The role you are interviewing for.</p>
        <textarea
          rows={6}
          value={jobDescription}
          placeholder="Paste the job description here…"
          onChange={(e) => setJobDescription(e.target.value)}
        />
      </div>

      <div className="card">
        <label>A few extra details (optional but recommended)</label>
        <p className="hint">
          Let the AI ask what it needs to tailor the interview.
        </p>
        <button
          className="secondary"
          onClick={getClarifications}
          disabled={loadingClarify || !jobDescription.trim()}
        >
          {loadingClarify ? "Thinking…" : "Suggest clarifying questions"}
        </button>
        {clarifications.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {clarifications.map((c, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <label>{c.question}</label>
                <input
                  type="text"
                  value={c.answer}
                  placeholder="Your answer (optional)"
                  onChange={(e) => {
                    const next = [...clarifications];
                    next[i] = { ...next[i], answer: e.target.value };
                    setClarifications(next);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row spread">
          <div>
            <label>Seniority level</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option>Intern</option>
              <option>Junior</option>
              <option>Mid</option>
              <option>Senior</option>
              <option>Lead / Manager</option>
            </select>
          </div>
          <div>
            <label>Session length</label>
            <div className="row">
              <span
                className={`pill ${length === 15 ? "active" : ""}`}
                onClick={() => setLength(15)}
              >
                15 min · short
              </span>
              <span
                className={`pill ${length === 30 ? "active" : ""}`}
                onClick={() => setLength(30)}
              >
                30 min · long
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <button className="record-btn" onClick={start}>
        ▶ Start interview
      </button>

      {sessions.length > 0 && (
        <div className="card" style={{ marginTop: 32 }}>
          <div className="row spread">
            <h2 style={{ margin: 0 }}>Your progress</h2>
            <button className="ghost" onClick={() => router.push("/progress")}>
              📈 Full dashboard
            </button>
          </div>
          <div style={{ height: 12 }} />
          {sessions.map((s) => (
            <div key={s.id} className="session-item">
              <div>
                <strong>{s.profile}</strong>{" "}
                <span className="muted">
                  · {new Date(s.createdAt).toLocaleDateString()} ·{" "}
                  {s.config.length} min
                </span>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  {s.report
                    ? `Overall ${s.report.scores.overall} · Technique ${s.report.scores.technique} · Clarity ${s.report.scores.clarity} · Words ${s.report.scores.wordUsage}`
                    : "No report"}
                </div>
              </div>
              <button
                className="ghost"
                onClick={() => deleteSession(s.id)}
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
