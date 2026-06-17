"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { sessionDelivery } from "@/lib/metrics";
import type { SavedSession } from "@/lib/types";

const SERIES = [
  { key: "overall", label: "Overall", color: "#6366f1" },
  { key: "technique", label: "Technique", color: "#34d399" },
  { key: "clarity", label: "Clarity", color: "#fbbf24" },
  { key: "wordUsage", label: "Word usage", color: "#f87171" },
] as const;

function ScoreChart({ sessions }: { sessions: SavedSession[] }) {
  // chronological order, only scored sessions
  const scored = sessions
    .filter((s) => s.report)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  const W = 620;
  const H = 260;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (scored.length === 0) {
    return <p className="muted">No scored sessions yet.</p>;
  }

  const x = (i: number) =>
    padL + (scored.length === 1 ? plotW / 2 : (i / (scored.length - 1)) * plotW);
  const y = (v: number) => padT + (1 - v / 100) * plotH;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Scores over time">
        {/* gridlines */}
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={4} y={y(g) + 4} fontSize={11} fill="var(--muted)">
              {g}
            </text>
          </g>
        ))}
        {SERIES.map((s) => {
          const pts = scored.map((sess, i) => ({
            cx: x(i),
            cy: y(sess.report!.scores[s.key]),
          }));
          const d = pts
            .map((p, i) => `${i === 0 ? "M" : "L"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`)
            .join(" ");
          return (
            <g key={s.key}>
              {pts.length > 1 && (
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
              )}
              {pts.map((p, i) => (
                <circle key={i} cx={p.cx} cy={p.cy} r={3.5} fill={s.color} />
              ))}
            </g>
          );
        })}
        {/* x labels (dates) */}
        {scored.map((sess, i) => (
          <text
            key={sess.id}
            x={x(i)}
            y={H - 8}
            fontSize={10}
            fill="var(--muted)"
            textAnchor="middle"
          >
            {new Date(sess.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </text>
        ))}
      </svg>
      <div className="row" style={{ gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {SERIES.map((s) => (
          <span key={s.key} className="row" style={{ gap: 6 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: s.color,
                display: "inline-block",
              }}
            />
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {s.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const router = useRouter();
  const sessions = useStore((s) => s.sessions);
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<string>("all");

  useEffect(() => setMounted(true), []);

  const profiles = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.profile))),
    [sessions],
  );

  const filtered = useMemo(
    () => (profile === "all" ? sessions : sessions.filter((s) => s.profile === profile)),
    [sessions, profile],
  );

  const scored = filtered.filter((s) => s.report);
  const avgOverall =
    scored.length > 0
      ? Math.round(
          scored.reduce((a, s) => a + s.report!.scores.overall, 0) / scored.length,
        )
      : 0;
  const best =
    scored.length > 0
      ? Math.max(...scored.map((s) => s.report!.scores.overall))
      : 0;

  if (!mounted) return null;

  return (
    <div className="container">
      <div className="row spread">
        <h1>📈 Progress</h1>
        <button className="ghost" onClick={() => router.push("/")}>
          ← Home
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="card center">
          <p className="muted">
            No sessions yet. Finish an interview to start tracking progress.
          </p>
          <button onClick={() => router.push("/")}>Start your first interview</button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="row spread">
              <div>
                <label>Profile</label>
                <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                  <option value="all">Everyone</option>
                  {profiles.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ gap: 24 }}>
                <div className="center">
                  <div className="score-num" style={{ fontSize: "1.6rem" }}>
                    {scored.length}
                  </div>
                  <div className="score-label">Sessions</div>
                </div>
                <div className="center">
                  <div className="score-num" style={{ fontSize: "1.6rem" }}>
                    {avgOverall}
                  </div>
                  <div className="score-label">Avg overall</div>
                </div>
                <div className="center">
                  <div className="score-num" style={{ fontSize: "1.6rem" }}>
                    {best}
                  </div>
                  <div className="score-label">Best</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Scores over time</h2>
            <ScoreChart sessions={filtered} />
          </div>

          <div className="card">
            <h2>Session history</h2>
            {filtered
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((s) => {
                const d = sessionDelivery(s);
                return (
                  <div key={s.id} className="session-item">
                    <div>
                      <strong>{s.profile}</strong>{" "}
                      <span className="muted">
                        · {new Date(s.createdAt).toLocaleString()} · {s.config.length}{" "}
                        min · {s.turns.length} Q
                      </span>
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {s.report
                          ? `Overall ${s.report.scores.overall} · Tech ${s.report.scores.technique} · Clarity ${s.report.scores.clarity} · Words ${s.report.scores.wordUsage} · ${d.avgWpm || "—"} wpm · ${d.totalFillers} fillers`
                          : "No report"}
                      </div>
                    </div>
                    {s.report && (
                      <button
                        className="secondary"
                        onClick={() => router.push(`/report?id=${s.id}`)}
                      >
                        View report
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
