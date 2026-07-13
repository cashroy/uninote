import React, { useEffect, useState } from "react";

const api = window.uninote;

// Pick an AI engine, then connect it. Claude runs on the user's subscription via
// the Claude CLI; Gemini just needs a free Google AI Studio API key (no install).
export default function Onboarding({ onDone }) {
  const [engine, setEngine] = useState(null); // null | "claude" | "gemini"
  const [saving, setSaving] = useState(false);

  // Claude
  const [claudeCode, setClaudeCode] = useState({ checking: false });
  const [status, setStatus] = useState(null); // null | "testing" | "ok" | error

  // Gemini
  const [gkey, setGkey] = useState("");
  const [gstatus, setGstatus] = useState(null); // null | "testing" | "ok" | error

  const recheck = async () => {
    setClaudeCode({ checking: true });
    setClaudeCode({ checking: false, ...(await api.checkClaudeCode()) });
  };
  useEffect(() => { if (engine === "claude") recheck(); }, [engine]);

  const testLogin = async () => {
    setStatus("testing");
    const res = await api.testClaude();
    setStatus(res.ok ? "ok" : res.error || "Couldn't reach Claude — try logging in.");
  };
  const finishClaude = async () => {
    setSaving(true);
    await api.saveSettings({ onboarded: true, backend: "claude-code" });
    onDone();
  };

  const testGemini = async () => {
    setGstatus("testing");
    const res = await api.testGeminiKey(gkey.trim());
    setGstatus(res.ok ? "ok" : res.error || "That key didn't work.");
  };
  const finishGemini = async () => {
    setSaving(true);
    await api.saveSettings({ onboarded: true, backend: "gemini", geminiApiKey: gkey.trim() });
    onDone();
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="brand big"><span className="brand-mark">Uni</span>Note</div>
        <h1>Choose how UniNote connects to AI</h1>
        <p className="onboarding-sub">
          UniNote uses AI to sort your uploads, write summaries and study sheets, and answer
          questions about your notes. Pick one — you can switch later in Settings.
        </p>

        <div
          className={`connect-card ${engine === "gemini" ? "selected" : ""}`}
          onClick={() => setEngine("gemini")}
        >
          <div className="connect-title">
            Google Gemini <span className="pill ok">free · easiest</span>
          </div>
          <p>Paste a free API key from Google AI Studio. Nothing to install — the simplest option for students.</p>
        </div>

        <div
          className={`connect-card ${engine === "claude" ? "selected" : ""}`}
          onClick={() => setEngine("claude")}
        >
          <div className="connect-title">
            Claude <span className="pill">your subscription</span>
          </div>
          <p>Runs on your existing Claude subscription via Claude Code (no per-use cost). Requires the free Claude CLI installed.</p>
        </div>

        {engine === "gemini" && (
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <div className="step-body">
                <div className="step-title">Get a free API key</div>
                <p>
                  Open <span className="mono">aistudio.google.com/apikey</span> (sign in with your
                  Google account), click <strong>Create API key</strong>, and copy it.
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div className="step-body">
                <div className="step-title">Paste it here</div>
                <div className="key-row">
                  <input
                    type="password"
                    placeholder="AIza…"
                    value={gkey}
                    onChange={(e) => { setGkey(e.target.value); setGstatus(null); }}
                  />
                  <button className="btn" disabled={!gkey.trim() || gstatus === "testing"} onClick={testGemini}>
                    {gstatus === "testing" ? "Checking…" : "Test key"}
                  </button>
                </div>
                {gstatus === "ok" && <div className="key-ok">✓ Connected to Gemini</div>}
                {gstatus && gstatus !== "ok" && gstatus !== "testing" && <div className="key-err">{gstatus}</div>}
              </div>
            </div>
          </div>
        )}

        {engine === "claude" && (
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <div className="step-body">
                <div className="step-title">
                  Claude on this PC
                  {claudeCode.checking && <span className="pill">checking…</span>}
                  {claudeCode.available && <span className="pill ok">found {claudeCode.version}</span>}
                  {!claudeCode.checking && !claudeCode.available && <span className="pill warn">not found</span>}
                </div>
                {!claudeCode.checking && !claudeCode.available && (
                  <p>
                    Install Claude Code (the official Claude CLI) from{" "}
                    <span className="mono">claude.com/product/claude-code</span>, then re-check.
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
                <p>Opens a terminal and your browser to log in. Do it once — UniNote remembers it.</p>
                <button className="btn" disabled={!claudeCode.available} onClick={() => api.loginClaude()}>
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
        )}

        {engine === "gemini" && (
          <button className="btn primary xl" disabled={gstatus !== "ok" || saving} onClick={finishGemini}>
            {saving ? "Setting up…" : "Start taking notes →"}
          </button>
        )}
        {engine === "claude" && (
          <button className="btn primary xl" disabled={status !== "ok" || saving} onClick={finishClaude}>
            {saving ? "Setting up…" : "Start taking notes →"}
          </button>
        )}

        <p className="onboarding-foot">
          Everything stays on this PC. Your notes never leave except the text sent to your chosen AI
          when you upload, summarise, or ask a question.
        </p>
      </div>
    </div>
  );
}
