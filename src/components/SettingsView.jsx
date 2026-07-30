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
  const [dateFmt, setDateFmt] = useState(settings.dateFormat || "system");
  const [backend, setBackend] = useState(settings.backend || "claude-code");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || "gemini-flash-latest");
  const [gconn, setGconn] = useState(null); // gemini test: null|"testing"|"ok"|err
  const [claudeCode, setClaudeCode] = useState(null);
  const [conn, setConn] = useState(null); // null | "testing" | "ok" | err
  const [graph, setGraph] = useState(null);
  const [graphMsg, setGraphMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [update, setUpdate] = useState(null); // update status
  const [acct, setAcct] = useState(null); // sync status: null while loading, then object
  const [ghToken, setGhToken] = useState("");
  const [syncBusy, setSyncBusy] = useState(""); // "" | "connecting" | "pushing" | "pulling"
  const [syncMsg, setSyncMsg] = useState(null); // { kind: "ok"|"err"|"conflict", text }

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

  useEffect(() => { api.syncStatus().then(setAcct); }, []);

  const refreshAcct = async () => setAcct(await api.syncStatus());

  const connectGithub = async () => {
    setSyncBusy("connecting");
    setSyncMsg(null);
    const res = await api.syncConnect(ghToken.trim());
    setSyncBusy("");
    if (res.ok) {
      setGhToken("");
      setSyncMsg({ kind: "ok", text: `Signed in as @${res.login}. Your library syncs to ${res.repo}.` });
      await refreshAcct();
      onSettingsChanged();
    } else {
      setSyncMsg({ kind: "err", text: res.error || "Couldn't connect." });
    }
  };

  const backup = async (force = false) => {
    setSyncBusy("pushing");
    setSyncMsg(null);
    const res = await api.syncPush(force ? { force: true } : {});
    setSyncBusy("");
    if (res.ok) {
      const big = res.skipped && res.skipped.length ? ` · ${res.skipped.length} oversized file(s) skipped` : "";
      setSyncMsg({ kind: "ok", text: `Backed up ${res.files} file(s), ${res.uploaded} changed${big}.` });
      await refreshAcct();
    } else if (res.conflict) {
      setSyncMsg({ kind: "conflict", text: res.note });
    } else {
      setSyncMsg({ kind: "err", text: res.error || "Back-up failed." });
    }
  };

  const restore = async () => {
    if (!confirm("Restore replaces this device's library with the account copy. Anything here that isn't backed up will be lost. Continue?")) return;
    setSyncBusy("pulling");
    setSyncMsg(null);
    const res = await api.syncPull();
    setSyncBusy("");
    if (res.ok) {
      setSyncMsg({ kind: "ok", text: `Restored ${res.files} file(s) — reloading…` });
      setTimeout(() => window.location.reload(), 900);
    } else {
      setSyncMsg({ kind: "err", text: res.error || "Restore failed." });
    }
  };

  const signOutGithub = async () => {
    if (!confirm("Sign out of GitHub on this device? The account copy stays safe — this only stops syncing here (and disconnects calendar publishing).")) return;
    await api.syncDisconnect();
    setSyncMsg(null);
    await refreshAcct();
    onSettingsChanged();
  };

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
    const patch = { indexMode, theme, backend, geminiModel, dateFormat: dateFmt };
    if (geminiKey.trim()) patch.geminiApiKey = geminiKey.trim();
    await api.saveSettings(patch);
    setGeminiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSettingsChanged();
  };

  const testConn = async () => {
    setConn("testing");
    const res = await api.testClaude();
    setConn(res.ok ? "ok" : res.error || "Not connected");
  };

  const testGemini = async () => {
    setGconn("testing");
    const res = await api.testGeminiKey(geminiKey.trim());
    setGconn(res.ok ? "ok" : res.error || "That key didn't work");
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
        <h2>Account &amp; sync</h2>
        {!acct && <p className="muted">Checking…</p>}

        {acct && !acct.connected && (
          <>
            <p className="muted">
              Sign in with GitHub to back up your whole library and use it on another device.
              UniNote syncs to a <strong>private</strong> repo it creates for you — nothing is public,
              and your token is stored encrypted on this device only.
            </p>
            <div className="key-row">
              <input
                type="password"
                placeholder="Paste a GitHub token (repo scope)"
                value={ghToken}
                onChange={(e) => { setGhToken(e.target.value); setSyncMsg(null); }}
              />
              <button className="btn primary" disabled={!ghToken.trim() || syncBusy === "connecting"} onClick={connectGithub}>
                {syncBusy === "connecting" ? "Connecting…" : "Sign in with GitHub"}
              </button>
            </div>
            <p className="hint">
              Create one at github.com/settings/tokens → “Generate new token (classic)” → tick{" "}
              <code>repo</code>. (The same token also powers calendar publishing.)
            </p>
          </>
        )}

        {acct && acct.connected && (
          <>
            <p className="muted">
              Signed in as <strong>@{acct.login}</strong> · syncing to{" "}
              <span className="mono">{acct.repo}</span>
              {acct.lastSyncAt ? ` · last synced ${new Date(acct.lastSyncAt).toLocaleString()}` : " · not synced yet"}.
            </p>
            {acct.remoteAhead && (
              <p className="key-err">
                Another device has newer changes in the account — Restore to pull them in before backing up.
              </p>
            )}
            <div className="graph-actions">
              <button className="btn primary" disabled={!!syncBusy} onClick={() => backup(false)}>
                {syncBusy === "pushing" ? "Backing up…" : "⬆ Back up now"}
              </button>{" "}
              <button className="btn" disabled={!!syncBusy || !acct.hasRemote} onClick={restore}>
                {syncBusy === "pulling" ? "Restoring…" : "⬇ Restore on this device"}
              </button>{" "}
              <button className="btn" disabled={!!syncBusy} onClick={signOutGithub}>Sign out</button>
            </div>
            {!acct.hasRemote && (
              <p className="hint">Nothing in the account yet — Back up to create the first copy, then Restore from your other device.</p>
            )}
          </>
        )}

        {syncMsg && (
          <p className={syncMsg.kind === "ok" ? "key-ok" : "key-err"} style={{ display: "block", marginTop: 8 }}>
            {syncMsg.text}
            {syncMsg.kind === "conflict" && (
              <button className="btn tiny" style={{ marginLeft: 8 }} onClick={() => backup(true)}>Force back-up</button>
            )}
          </p>
        )}
      </section>

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
        <h2>AI engine</h2>
        <p className="muted">Which AI powers UniNote. Switch any time — remember to Save.</p>
        <label className="radio-row">
          <input type="radio" checked={backend === "claude-code"} onChange={() => setBackend("claude-code")} />
          <span>
            <strong>Claude</strong> — your Claude subscription via Claude Code
            {claudeCode?.available ? ` (detected ${claudeCode.version})` : ""}
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" checked={backend === "gemini"} onChange={() => setBackend("gemini")} />
          <span>
            <strong>Google Gemini</strong> — free Google AI Studio API key
            {settings.hasGeminiKey ? " (key saved ✓)" : ""}
          </span>
        </label>
        {backend === "gemini" && (
          <div className="graph-actions">
            <div className="key-row">
              <input
                type="password"
                placeholder={settings.hasGeminiKey ? "Key saved — paste a new one to replace" : "Paste your AI Studio key (AIza…)"}
                value={geminiKey}
                onChange={(e) => { setGeminiKey(e.target.value); setGconn(null); }}
              />
              <button className="btn" disabled={!geminiKey.trim() || gconn === "testing"} onClick={testGemini}>
                {gconn === "testing" ? "Checking…" : "Test key"}
              </button>
            </div>
            {gconn === "ok" && <span className="key-ok"> ✓ Works</span>}
            {gconn && gconn !== "ok" && gconn !== "testing" && <span className="key-err"> {gconn}</span>}
            <p className="hint">
              Model{" "}
              <input className="date-input" style={{ width: 190 }} value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} />
              {" "}— e.g. gemini-flash-latest (recommended) or gemini-pro-latest. Free key at aistudio.google.com/apikey.
            </p>
          </div>
        )}
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
        <h2>Date format</h2>
        <p className="muted">How dates are shown across UniNote.</p>
        <select className="text-input" value={dateFmt} onChange={(e) => setDateFmt(e.target.value)}>
          <option value="system">Default (e.g. 13 Jul 2026)</option>
          <option value="dmy">DD/MM/YYYY</option>
          <option value="mdy">MM/DD/YYYY</option>
          <option value="ymd">YYYY-MM-DD</option>
        </select>
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
