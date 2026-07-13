import React, { useEffect, useRef, useState } from "react";
import { md } from "../util.js";

const api = window.uninote;

export const SCOPES = [
  { id: "everything", label: "Everything", desc: "Formulas, definitions, theorems & key results" },
  { id: "formulas", label: "All formulas", desc: "Equations and identities only" },
  { id: "definitions", label: "All definitions", desc: "Key terms and their meanings" },
  { id: "formulas_definitions", label: "Formulas + definitions", desc: "Both, grouped by topic" },
  { id: "results", label: "Key results & theorems", desc: "Laws, theorems and properties" },
  { id: "custom", label: "Custom…", desc: "Describe exactly what to include" },
];
export const SCOPE_LABEL = Object.fromEntries(SCOPES.map((s) => [s.id, s.label]));

// Build a new scoped formula sheet for a paper. It's saved to the paper's
// Formula sheets section on success.
export default function FormulaSheetModal({ paperId, paperLabel, onClose, onDone }) {
  const [scope, setScope] = useState("everything");
  const [custom, setCustom] = useState("");
  const [title, setTitle] = useState("");
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState("");
  const liveRef = useRef("");

  const suggested = `${SCOPE_LABEL[scope]} — ${paperLabel}`;

  useEffect(() => {
    const off = api.onFormulaDelta(({ paperId: pid, text }) => {
      if (pid !== paperId) return;
      liveRef.current += text;
      setLive(liveRef.current);
    });
    return off;
  }, [paperId]);

  const run = async () => {
    setRunning(true);
    setError("");
    liveRef.current = "";
    setLive("");
    const res = await api.generateFormulaSheet(
      paperId, scope, scope === "custom" ? custom : "", title.trim() || suggested
    );
    setRunning(false);
    if (!res.ok) { setError(res.error); return; }
    onDone?.();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={() => !running && onClose()}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>📐 New formula sheet — {paperLabel}</h2>
        <p className="modal-sub">
          The AI reads this paper's material and builds a formula sheet. Choose what goes on it — you
          can make as many as you like (e.g. one of formulas, one of definitions).
        </p>

        <div className="mode-list">
          {SCOPES.map((s) => (
            <label key={s.id} className={`mode-option ${scope === s.id ? "selected" : ""}`}>
              <input type="radio" name="scope" checked={scope === s.id} onChange={() => setScope(s.id)} disabled={running} />
              <div>
                <div className="mode-label">{s.label}</div>
                <div className="mode-desc">{s.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {scope === "custom" && (
          <textarea
            className="custom-instruction"
            placeholder="e.g. Only the statistical formulas and when to use each test"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            disabled={running}
          />
        )}

        <h3 className="modal-h3">Title</h3>
        <input
          className="text-input"
          placeholder={suggested}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={running}
        />

        {error && <p className="key-err">{error}</p>}
        {running && (
          <div className="md-body" style={{ maxHeight: "40vh", overflowY: "auto", marginTop: 12 }}
            dangerouslySetInnerHTML={md(live || "Reading your material and building the sheet…")} />
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={running}>Cancel</button>
          <button className="btn primary" onClick={run} disabled={running || (scope === "custom" && !custom.trim())}>
            {running ? "Building…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
