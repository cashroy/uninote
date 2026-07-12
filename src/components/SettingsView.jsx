import React, { useEffect, useState } from "react";

const api = window.uninote;

const THEMES = [
  { id: "mono", label: "Minimal", desc: "Clean black & white", swatch: ["#ffffff", "#18181b"] },
  { id: "paper", label: "Warm paper", desc: "Cream & terracotta", swatch: ["#f6f3ec", "#c46a2a"] },
  { id: "dark", label: "Dark", desc: "Low-light, easy on the eyes", swatch: ["#1a1a1e", "#e4e4e7"] },
];

export default function SettingsView({ settings, onSettingsChanged }) {
  const [indexMode, setIndexMode] = useState(settings.indexMode);
  const [theme, setTheme] = useState(settings.theme || "mono");
  const [university, setUniversity] = useState(settings.university || "");
  const [claudeCode, setClaudeCode] = useState(null);
  const [conn, setConn] = useState(null); // null | "testing" | "ok" | err
  const [graph, setGraph] = useState(null);
  const [graphMsg, setGraphMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [update, setUpdate] = useState(null); // update status

  useEffect(() => {
    (async () => {
      setClaudeCode(await api.checkClaudeCode());
      setGraph(await api.graphifyStatus());
    })();
    const offUpd = api.onUpdateStatus((s) => setUpdate(s));
    const offGraph = api.onGraphifyProgress((p) => {
      if (p.stage === "started") setGraphMsg("Building knowledge graph… this can take a while.");
      else if (p.stage === "working") setGraphMsg("Building knowledge graph… (Claude is extracting)");
      else if (p.stage === "done") {
        setGraphMsg("Graph built ✓");
        api.graphifyStatus().then(setGraph);
      } else if (p.stage === "error") setGraphMsg("Graph build failed: " + p.error);
    });
    return () => { offUpd(); offGraph(); };
  }, []);

  const checkUpdates = async () => {
    setUpdate({ status: "checking" });
    const res = await api.updateCheck();
    if (res.status === "unsupported") setUpdate({ status: "unsupported" });
    else if (res.status === "error") setUpdate({ status: "error", error: res.error });
    // other states arrive via onUpdateStatus events
  };

  const updateLine = () => {
    if (!update) return "";
    switch (update.status) {
      case "checking": return "Checking…";
      case "none": return "You're on the latest version ✓";
      case "available": return `Update available: ${update.version}`;
      case "downloading": return `Downloading… ${update.percent ?? 0}%`;
      case "ready": return `Update ${update.version} ready — restart to install`;
      case "unsupported": return "The portable build can't self-update — download the latest from the website.";
      case "error": return "Couldn't check: " + (update.error || "unknown error");
      default: return "";
    }
  };

  // live-apply theme as you click so you can see it immediately
  const pickTheme = (id) => {
    setTheme(id);
    document.documentElement.dataset.theme = id;
  };

  const save = async () => {
    await api.saveSettings({ indexMode, theme, university });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSettingsChanged();
  };

  const testConn = async () => {
    setConn("testing");
    const res = await api.testClaude();
    setConn(res.ok ? "ok" : res.error || "Not connected");
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <div className="crumbs">UniNote</div>
          <h1>Settings</h1>
        </div>
      </header>

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card ${theme === t.id ? "selected" : ""}`}
              onClick={() => pickTheme(t.id)}
            >
              <div className="theme-swatch">
                <span style={{ background: t.swatch[0] }} />
                <span style={{ background: t.swatch[1] }} />
              </div>
              <div className="theme-label">{t.label}</div>
              <div className="theme-desc">{t.desc}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Claude account</h2>
        <p className="muted">
          UniNote runs on your Claude subscription via Claude Code
          {claudeCode?.available ? ` (detected ${claudeCode.version})` : claudeCode ? " (not found on this PC)" : ""}.
        </p>
        <div className="graph-actions">
          <button className="btn" onClick={() => api.loginClaude()}>🔐 Log in / switch account</button>{" "}
          <button className="btn" disabled={conn === "testing"} onClick={testConn}>
            {conn === "testing" ? "Checking…" : "Test connection"}
          </button>
          {conn === "ok" && <span className="key-ok"> ✓ Connected</span>}
          {conn && conn !== "ok" && conn !== "testing" && <span className="key-err"> {conn}</span>}
        </div>
      </section>

      <section className="settings-section">
        <h2>University</h2>
        <p className="muted">
          Used when you ask Claude to fill in semester and break dates in the Calendar.
        </p>
        <input
          className="text-input"
          placeholder="e.g. University of Auckland"
          value={university}
          onChange={(e) => setUniversity(e.target.value)}
        />
      </section>

      <section className="settings-section">
        <h2>Answer engine</h2>
        <p className="muted">How the assistant finds relevant material in your notes before answering.</p>
        <label className="radio-row">
          <input type="radio" checked={indexMode === "builtin"} onChange={() => setIndexMode("builtin")} />
          <span><strong>Built-in index</strong> — instant, works everywhere, no setup</span>
        </label>
        <label className="radio-row">
          <input type="radio" checked={indexMode === "graphify"} onChange={() => setIndexMode("graphify")} />
          <span>
            <strong>Graphify knowledge graph</strong> — richer cross-document answers, fewer tokens
            per question
            {graph
              ? graph.graphExists
                ? " (graph ready ✓)"
                : graph.cliAvailable
                ? " (graphify installed, graph not built yet)"
                : " (graphify CLI not found — falls back to built-in)"
              : ""}
          </span>
        </label>
        {indexMode === "graphify" && (
          <div className="graph-actions">
            <button className="btn" onClick={() => api.graphifyBuild()}>
              {graph?.graphExists ? "↻ Update knowledge graph" : "Build knowledge graph now"}
            </button>
            {graphMsg && <span className="muted"> {graphMsg}</span>}
            <p className="hint">
              Building runs your graphify skill over the whole library via Claude Code. Re-run it
              after adding lots of new notes.
            </p>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Updates</h2>
        <p className="muted">UniNote {settings.appVersion ? `v${settings.appVersion}` : ""} · checks automatically on launch.</p>
        <div className="graph-actions">
          <button className="btn" disabled={update?.status === "checking"} onClick={checkUpdates}>
            {update?.status === "checking" ? "Checking…" : "Check for updates"}
          </button>
          {update?.status === "available" && (
            <button className="btn primary" onClick={() => api.updateDownload()}>Download</button>
          )}
          {update?.status === "ready" && (
            <button className="btn primary" onClick={() => api.updateInstall()}>Restart &amp; install</button>
          )}
          {updateLine() && <span className="muted"> {updateLine()}</span>}
        </div>
      </section>

      <section className="settings-section">
        <h2>Library</h2>
        <p className="muted mono">{settings.libraryPath}</p>
        <button className="btn" onClick={() => api.showInExplorer()}>📂 Show location in Explorer</button>
      </section>

      <div className="settings-save">
        <button className="btn primary" onClick={save}>Save settings</button>
        {saved && <span className="key-ok"> ✓ Saved</span>}
      </div>
    </div>
  );
}
