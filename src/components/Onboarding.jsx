import React, { useEffect, useState } from "react";

const api = window.uninote;

// Login-only onboarding: the app runs on the user's Claude subscription via the
// Claude Code CLI. No API key, no per-use billing.
export default function Onboarding({ onDone }) {
  const [claudeCode, setClaudeCode] = useState({ checking: true });
  const [status, setStatus] = useState(null); // null | "testing" | "ok" | error string
  const [saving, setSaving] = useState(false);

  const recheck = async () => {
    setClaudeCode({ checking: true });
    setClaudeCode({ checking: false, ...(await api.checkClaudeCode()) });
  };

  useEffect(() => {
    recheck();
  }, []);

  const testLogin = async () => {
    setStatus("testing");
    const res = await api.testClaude();
    setStatus(res.ok ? "ok" : res.error || "Couldn't reach Claude — try logging in.");
  };

  const finish = async () => {
    setSaving(true);
    await api.saveSettings({ onboarded: true, backend: "claude-code" });
    onDone();
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="brand big"><span className="brand-mark">Uni</span>Note</div>
        <h1>Sign in with Claude to get started</h1>
        <p className="onboarding-sub">
          UniNote uses Claude to sort your uploads, write summaries and study sheets, and answer
          questions about your notes — all on your own Claude subscription. No API key, no
          pay-per-use.
        </p>

        <div className="steps">
          <div className="step">
            <div className="step-num">1</div>
            <div className="step-body">
              <div className="step-title">
                Claude on this PC
                {claudeCode.checking && <span className="pill">checking…</span>}
                {claudeCode.available && <span className="pill ok">found {claudeCode.version}</span>}
                {!claudeCode.checking && !claudeCode.available && (
                  <span className="pill warn">not found</span>
                )}
              </div>
              {!claudeCode.checking && !claudeCode.available && (
                <p>
                  Claude isn't installed yet. Install Claude Code (the official Claude CLI) from{" "}
                  <span className="mono">claude.com/product/claude-code</span>, then click
                  re-check.
                  <br />
                  <button className="btn small" onClick={recheck}>↻ Re-check</button>
                </p>
              )}
              {claudeCode.available && <p className="muted">Detected — you're ready to sign in.</p>}
            </div>
          </div>

          <div className={`step ${claudeCode.available ? "" : "dim"}`}>
            <div className="step-num">2</div>
            <div className="step-body">
              <div className="step-title">Sign in to your Claude account</div>
              <p>
                Opens a terminal and your browser to log in. Do it once — UniNote remembers it
                afterwards.
              </p>
              <button
                className="btn"
                disabled={!claudeCode.available}
                onClick={() => api.loginClaude()}
              >
                🔐 Log in to Claude
              </button>
            </div>
          </div>

          <div className={`step ${claudeCode.available ? "" : "dim"}`}>
            <div className="step-num">3</div>
            <div className="step-body">
              <div className="step-title">Confirm the connection</div>
              <button className="btn" disabled={!claudeCode.available || status === "testing"} onClick={testLogin}>
                {status === "testing" ? "Checking…" : "Test connection"}
              </button>
              {status === "ok" && <div className="key-ok">✓ Connected to Claude</div>}
              {status && status !== "ok" && status !== "testing" && (
                <div className="key-err">{status} — finish logging in step 2, then retry.</div>
              )}
            </div>
          </div>
        </div>

        <button className="btn primary xl" disabled={status !== "ok" || saving} onClick={finish}>
          {saving ? "Setting up…" : "Start taking notes →"}
        </button>
        <p className="onboarding-foot">
          Everything stays on this PC. Claude is only contacted when you upload, summarise, or ask
          a question.
        </p>
      </div>
    </div>
  );
}
