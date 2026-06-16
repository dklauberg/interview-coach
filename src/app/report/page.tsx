"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { computeDelivery, paceLabel } from "@/lib/metrics";
import type { CorrectionItem, Report } from "@/lib/types";

function scoreColor(n: number): string {
  if (n >= 80) return "var(--success)";
  if (n >= 60) return "var(--warning)";
  return "var(--danger)";
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-card">
      <div className="score-num" style={{ color: scoreColor(value) }}>
        {value}
      </div>
      <div className="score-label">{label}</div>
      <div className="bar">
        <span style={{ width: `${value}%`, background: scoreColor(value) }} />
      </div>
    </div>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const config = useStore((s) => s.config);
  const turns = useStore((s) => s.turns);
  const report = useStore((s) => s.report);
  const setReport = useStore((s) => s.setReport);
  const saveCurrentSession = useStore((s) => s.saveCurrentSession);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modelAnswers, setModelAnswers] = useState<Record<number, string> | null>(
    null,
  );
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const requested = useRef(false);
  const saved = useRef(false);

  const delivery = useMemo(() => computeDelivery(turns), [turns]);

  useEffect(() => {
    if (!config || turns.length === 0) {
      router.replace("/");
      return;
    }
    if (report || requested.current) return;
    requested.current = true;
    setLoading(true);

    fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, turns }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to build report");
        setReport(data as Report);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (report && !saved.current) {
      saved.current = true;
      saveCurrentSession();
    }
  }, [report, saveCurrentSession]);

  async function loadModelAnswers() {
    if (!config) return;
    setLoadingAnswers(true);
    setError("");
    try {
      const res = await fetch("/api/model-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, turns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const map: Record<number, string> = {};
      for (const a of data.answers as { turnIndex: number; answer: string }[]) {
        map[a.turnIndex] = a.answer;
      }
      setModelAnswers(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingAnswers(false);
    }
  }

  if (!config) return null;

  const correctionsByTurn = (report?.corrections ?? []).reduce(
    (acc, c) => {
      (acc[c.turnIndex] ||= []).push(c);
      return acc;
    },
    {} as Record<number, CorrectionItem[]>,
  );

  return (
    <div className="container">
      <h1>📊 Interview feedback</h1>
      <p className="subtitle">
        {config.profile} · {config.level} · {config.length} min ·{" "}
        {turns.length} questions
      </p>

      {loading && (
        <div className="card center">
          <div className="loader" />
          <p>Analyzing your interview and writing your feedback…</p>
          <p className="hint">This uses the strongest model, so give it a moment.</p>
        </div>
      )}

      {error && (
        <div className="card">
          <p className="error">{error}</p>
          <button
            onClick={() => {
              requested.current = false;
              setError("");
              location.reload();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {report && (
        <>
          <div className="card">
            <h2>Scores</h2>
            <div className="scores">
              <ScoreCard label="Overall" value={report.scores.overall} />
              <ScoreCard label="Technique" value={report.scores.technique} />
              <ScoreCard label="Clarity" value={report.scores.clarity} />
              <ScoreCard label="Word usage" value={report.scores.wordUsage} />
            </div>
            <p style={{ marginTop: 18 }}>{report.summary}</p>
          </div>

          {/* Delivery metrics — computed locally from the audio + transcript */}
          <div className="card">
            <h2>🗣️ Delivery</h2>
            <div className="scores">
              <div className="score-card">
                <div className="score-num">{delivery.avgWpm || "—"}</div>
                <div className="score-label">Words / min</div>
                <div className="hint" style={{ marginTop: 6 }}>
                  {paceLabel(delivery.avgWpm)}
                </div>
              </div>
              <div className="score-card">
                <div className="score-num">{delivery.totalFillers}</div>
                <div className="score-label">Filler words</div>
                <div className="hint" style={{ marginTop: 6 }}>
                  {delivery.fillerRate} per 100 words
                </div>
              </div>
              <div className="score-card">
                <div className="score-num">{delivery.totalWords}</div>
                <div className="score-label">Words spoken</div>
              </div>
            </div>
            {Object.keys(delivery.fillerBreakdown).length > 0 && (
              <p className="hint" style={{ marginTop: 14 }}>
                Most used fillers:{" "}
                {Object.entries(delivery.fillerBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([w, n]) => `"${w}" ×${n}`)
                  .join(", ")}
              </p>
            )}
          </div>

          <div className="card">
            <h2>✅ Strengths</h2>
            <ul className="clean">
              {report.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>🎯 Areas to improve</h2>
            <ul className="clean">
              {report.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>🚀 Practice these next</h2>
            <ul className="clean">
              {report.actions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="row spread">
              <h2 style={{ margin: 0 }}>Transcript &amp; English corrections</h2>
              {!modelAnswers && (
                <button
                  className="secondary no-print"
                  onClick={loadModelAnswers}
                  disabled={loadingAnswers}
                >
                  {loadingAnswers ? "Writing examples…" : "💡 Show example answers"}
                </button>
              )}
            </div>
            {turns.map((t) => (
              <div key={t.index} style={{ marginBottom: 22 }}>
                <div className="transcript-turn" style={{ borderBottom: "none" }}>
                  <div className="q">Q: {t.question}</div>
                  <div className="a">A: {t.answerTranscript || "—"}</div>
                </div>
                {(correctionsByTurn[t.index] ?? []).map((c, i) => (
                  <div key={i} className="correction">
                    <div>
                      <span className="orig">{c.original}</span>{" "}
                      <span className="fix">→ {c.correction}</span>
                      <span className="tag">{c.type}</span>
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: "0.88rem", marginTop: 4 }}
                    >
                      {c.explanation}
                    </div>
                  </div>
                ))}
                {modelAnswers && modelAnswers[t.index] && (
                  <div className="model-answer">
                    <div className="model-answer-label">💡 Strong example answer</div>
                    {modelAnswers[t.index]}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="row no-print" style={{ marginTop: 24 }}>
        <button onClick={() => router.push("/")}>New interview</button>
        <button
          className="secondary"
          onClick={() => {
            useStore.getState().startSession(config);
            router.push("/interview");
          }}
        >
          Practice again (same role)
        </button>
        {report && (
          <>
            <button className="secondary" onClick={() => window.print()}>
              ⬇ Download PDF
            </button>
            <button className="secondary" onClick={() => router.push("/progress")}>
              📈 Progress
            </button>
          </>
        )}
      </div>
    </div>
  );
}
