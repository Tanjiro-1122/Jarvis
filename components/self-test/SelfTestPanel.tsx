"use client";

import React, { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  suite: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  durationMs: number;
  detail?: string;
}

interface SelfTestReport {
  overall: "pass" | "fail" | "warn";
  summary: { total: number; passed: number; failed: number; warned: number; totalMs: number };
  results: TestResult[];
  runAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUITE_LABELS: Record<string, string> = {
  memory:        "💾 Memory",
  supabase:      "🗄️ Supabase",
  github:        "🐙 GitHub",
  vercel:        "▲ Vercel",
  chat:          "💬 Chat API",
  deploy_health: "🚀 Deploy",
  revenuecat:    "💰 RevenueCat",
  vault:         "🔐 Vault",
  env:           "🔑 Env",
  openai:        "🤖 OpenAI",
};

const STATUS_ICON: Record<string, string> = {
  pass: "✓",
  fail: "✗",
  warn: "⚠",
  skip: "–",
  running: "⟳",
};

const STATUS_COLOR: Record<string, string> = {
  pass: "#4ade80",
  fail: "#f87171",
  warn: "#fbbf24",
  skip: "#6b7280",
  running: "#60a5fa",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function OverallBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "#6b7280";
  const label = status === "pass" ? "All Systems Go" : status === "warn" ? "Some Warnings" : "Issues Found";
  return (
    <span style={{
      background: `${color}18`,
      border: `1px solid ${color}55`,
      color,
      borderRadius: 20,
      padding: "0.18rem 0.65rem",
      fontSize: "0.72rem",
      fontWeight: 600,
      letterSpacing: "0.02em",
    }}>
      {STATUS_ICON[status]} {label}
    </span>
  );
}

function SuiteGroup({ suite, results }: { suite: string; results: TestResult[] }) {
  const [open, setOpen] = useState(false);
  const allPass = results.every((r) => r.status === "pass");
  const hasFail = results.some((r) => r.status === "fail");
  const groupColor = hasFail ? STATUS_COLOR.fail : allPass ? STATUS_COLOR.pass : STATUS_COLOR.warn;

  return (
    <div style={{
      border: `1px solid ${groupColor}30`,
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: "0.4rem",
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          background: `${groupColor}0a`,
          border: "none",
          padding: "0.45rem 0.7rem",
          cursor: "pointer",
          color: "#f0ede8",
          fontSize: "0.78rem",
          fontWeight: 500,
          textAlign: "left",
        }}
      >
        <span style={{ color: groupColor, fontSize: "0.8rem", minWidth: 14 }}>
          {hasFail ? "✗" : allPass ? "✓" : "⚠"}
        </span>
        <span style={{ flex: 1 }}>{SUITE_LABELS[suite] ?? suite}</span>
        <span style={{ color: "rgba(240,237,232,0.4)", fontSize: "0.7rem" }}>
          {results.filter((r) => r.status === "pass").length}/{results.length}
        </span>
        <span style={{ color: "rgba(240,237,232,0.3)", fontSize: "0.65rem" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0.3rem 0.5rem 0.4rem" }}>
          {results.map((r) => (
            <div key={r.name} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.4rem",
              padding: "0.25rem 0.2rem",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              fontSize: "0.73rem",
            }}>
              <span style={{ color: STATUS_COLOR[r.status] ?? "#6b7280", flexShrink: 0, marginTop: 1 }}>
                {STATUS_ICON[r.status]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "rgba(240,237,232,0.6)", marginRight: "0.4rem" }}>
                  {r.name.replace(`${r.suite}:`, "")}
                </span>
                <span style={{ color: "rgba(240,237,232,0.85)" }}>{r.message}</span>
                {r.detail && (
                  <div style={{ color: "rgba(240,237,232,0.35)", fontSize: "0.67rem", marginTop: 2 }}>
                    {r.detail}
                  </div>
                )}
              </div>
              <span style={{ color: "rgba(240,237,232,0.25)", fontSize: "0.65rem", flexShrink: 0 }}>
                {r.durationMs}ms
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface SelfTestPanelProps {
  sessionId?: string | null;
}

export function SelfTestPanel({ sessionId }: SelfTestPanelProps) {
  const [report, setReport] = useState<SelfTestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSuite, setActiveSuite] = useState<string | null>(null);

  const runTests = useCallback(async (suite?: string) => {
    setLoading(true);
    setError("");
    setActiveSuite(suite ?? null);
    try {
      const params = new URLSearchParams();
      if (suite) params.set("suite", suite);
      if (sessionId) params.set("sessionId", sessionId);
      const res = await fetch(`/api/self-test?${params}`, { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as SelfTestReport;
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test run failed");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Group results by suite
  const suiteGroups = report
    ? Object.entries(
        report.results.reduce<Record<string, TestResult[]>>((acc, r) => {
          if (!acc[r.suite]) acc[r.suite] = [];
          acc[r.suite].push(r);
          return acc;
        }, {})
      )
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem" }}>
        <span style={{ fontSize: "0.78rem", color: "rgba(240,237,232,0.6)", fontWeight: 500 }}>
          System Self-Test
        </span>
        {report && <OverallBadge status={report.overall} />}
      </div>

      {/* Run All button */}
      <button
        onClick={() => runTests()}
        disabled={loading}
        style={{
          background: loading ? "rgba(255,255,255,0.04)" : "rgba(180,80,40,0.18)",
          border: `1px solid ${loading ? "rgba(255,255,255,0.08)" : "rgba(180,80,40,0.45)"}`,
          borderRadius: 8,
          color: loading ? "rgba(240,237,232,0.4)" : "#f0ede8",
          fontSize: "0.78rem",
          fontWeight: 500,
          padding: "0.45rem 0.9rem",
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          transition: "all 0.15s",
          width: "100%",
        }}
      >
        {loading ? (
          <>
            <span style={{
              width: 13, height: 13,
              border: "2px solid rgba(255,255,255,0.1)",
              borderTop: "2px solid rgba(180,80,40,0.8)",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.7s linear infinite",
            }} />
            Running{activeSuite ? ` ${activeSuite}` : " all tests"}…
          </>
        ) : (
          <>▶ Run All Tests</>
        )}
      </button>

      {/* Individual suite quick-run buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
        {Object.entries(SUITE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => runTests(key)}
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              color: "rgba(240,237,232,0.55)",
              fontSize: "0.68rem",
              padding: "0.2rem 0.55rem",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.12s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(255,60,60,0.1)",
          border: "1px solid rgba(255,60,60,0.2)",
          borderRadius: 8,
          color: "#f87171",
          fontSize: "0.78rem",
          padding: "0.5rem 0.7rem",
        }}>
          {error}
        </div>
      )}

      {/* Summary bar */}
      {report && (
        <div style={{
          display: "flex",
          gap: "0.6rem",
          fontSize: "0.72rem",
          color: "rgba(240,237,232,0.45)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: "0.4rem",
          flexWrap: "wrap",
        }}>
          <span style={{ color: STATUS_COLOR.pass }}>✓ {report.summary.passed} passed</span>
          {report.summary.failed > 0 && <span style={{ color: STATUS_COLOR.fail }}>✗ {report.summary.failed} failed</span>}
          {report.summary.warned > 0 && <span style={{ color: STATUS_COLOR.warn }}>⚠ {report.summary.warned} warned</span>}
          <span style={{ marginLeft: "auto" }}>{report.summary.totalMs}ms</span>
        </div>
      )}

      {/* Suite groups */}
      {suiteGroups.length > 0 && (
        <div>
          {suiteGroups.map(([suite, results]) => (
            <SuiteGroup key={suite} suite={suite} results={results} />
          ))}
        </div>
      )}

      {/* Timestamp */}
      {report && (
        <div style={{ fontSize: "0.65rem", color: "rgba(240,237,232,0.25)", textAlign: "right" }}>
          ran at {new Date(report.runAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
