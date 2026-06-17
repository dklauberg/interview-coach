"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function ReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewId = searchParams.get("id"); // when set, we're viewing a past saved session

  const activeConfig = useStore((s) => s.config);
  const activeTurns = useStore((s) => s.turns);
  const activeReport = useStore((s) => s.report);
  const sessions = useStore((s) => s.sessions);
  const setReport = useStore((s) => s.setReport);
  const saveCurrentSession = useStore((s) => s.saveCurrentSession);
  const startSession = useStore((s) => s.startSession);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modelAnswers, setModelAnswers] = useState<Record<number, string> | null>(
    null,
  );
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const requested = useRef(false);
  const saved = useRef(false);

  const isSaved = !!viewId;
  const savedSession = viewId ? sessions.find((s) => s.id === viewId) : undefined;

  // effective data: a past saved session, or the active just-finished one
  const config = isSaved ? savedSession?.config : activeConfig;
  const turns = (isSaved ? savedSession?.turns : activeTurns) ?? [];
  const report = isSaved ? savedSession?.report ?? null : activeReport;

  const delivery = useMemo(() => computeDelivery(turns), [turns]);

  useEffect(() => setMounted(true), []);

  // generate the report — only for a freshly finished (active) session
  useEffect(() => {
    if (isSaved) return;
    if (!activeConfig || activeTurns.length === 0) {
      router.replace("/");
      return;
    }
    if (activeReport || requested.current) return;
    requested.current = true;
    setLoading(true);

    fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: activeConfig, turns: activeTurns }),
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

  // persist the active session to history once its report exists
  useEffect(() => {
    if (isSaved) return;
    if (activeReport && !saved.current) {
      saved.current = true;
      saveCurrentSession();
    }
  }, [isSaved, activeReport, saveCurrentSession]);

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

  if (!mounted) return null;

  // viewing a past session that no longer exists
  if (isSaved && !savedSession) {
    return (
      <div className="container">
        <div className="card center">
          <p className="muted">That session was not found.</p>
          <button onClick={() => router.push("/progress")}>Back to dashboard</button>
        </div>
      </div>
    );
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
        {isSaved && savedSession
          ? ` · ${new Date(savedSession.createdAt).toLocaleString()}`
          : ""}
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
          {!isSaved && (
            <button
              onClick={() => {
                requested.current = false;
                setError("");
                location.reload();
              }}
            >
              Try again
            </button>
          )}
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
            startSession(config);
            router.push("/interview");
          }}
        >
          Practice again (same role)
        </button>
        {report && (
          <button className="secondary" onClick={() => window.print()}>
            ⬇ Download PDF
          </button>
        )}
        <button className="secondary" onClick={() => router.push("/progress")}>
          📈 Progress
        </button>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="container">
          <div className="loader" />
        </div>
      }
    >
      <ReportContent />
    </Suspense>
  );
}
