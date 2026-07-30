import React, { useState } from "react";
import { Sparkles } from "lucide-react";

const api = window.uninote;

const MODES = [
  { id: "study-sheet", label: "Study sheet", desc: "All the key points as a compact revision sheet" },
  { id: "outline", label: "Structured outline", desc: "Hierarchical outline of topics and detail" },
  { id: "flashcards", label: "Flashcards", desc: "Q&A cards for active recall" },
  { id: "eli5", label: "Plain-language explainer", desc: "The content explained simply" },
  { id: "exam-prep", label: "Exam revision summary", desc: "Likely exam content, pitfalls, checklist" },
  { id: "custom", label: "Custom…", desc: "Tell Claude exactly what you want" },
];

// Offered right after ingest (possibly for several docs) and from each doc card.
export default function SummarizeDialog({ docs, onClose }) {
  const [mode, setMode] = useState("study-sheet");
  const [custom, setCustom] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({}); // docId -> "working"|"done"|error msg
  const [finished, setFinished] = useState(false);

  const run = async () => {
    setRunning(true);
    for (const doc of docs) {
      setProgress((p) => ({ ...p, [doc.id]: "working" }));
      try {
        await api.summarize(doc.id, mode === "custom" ? "study-sheet" : mode, mode === "custom" ? custom : undefined);
        setProgress((p) => ({ ...p, [doc.id]: "done" }));
      } catch (err) {
        setProgress((p) => ({ ...p, [doc.id]: "Error: " + (err.message || err) }));
      }
    }
    setRunning(false);
    setFinished(true);
  };

  return (
    <div className="modal-backdrop" onClick={() => !running && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2><Sparkles size={18} /> Summarise with Claude</h2>
        <p className="modal-sub">
          {docs.length === 1
            ? <>Create a paired summary for <strong>{docs[0].fileName}</strong>.</>
            : <>Create paired summaries for <strong>{docs.length} documents</strong>.</>}
        </p>

        <div className="mode-list">
          {MODES.map((m) => (
            <label key={m.id} className={`mode-option ${mode === m.id ? "selected" : ""}`}>
              <input
                type="radio"
                name="mode"
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
                disabled={running}
              />
              <div>
                <div className="mode-label">{m.label}</div>
                <div className="mode-desc">{m.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {mode === "custom" && (
          <textarea
            className="custom-instruction"
            placeholder="e.g. Summarise only the statistical methods, with one worked example each"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            disabled={running}
          />
        )}

        {Object.keys(progress).length > 0 && (
          <div className="progress-list">
            {docs.map((d) => (
              <div key={d.id} className="progress-row">
                <span className="progress-file">{d.fileName}</span>
                <span className={`progress-state ${progress[d.id] === "done" ? "ok" : ""}`}>
                  {progress[d.id] === "working" ? "Summarising…" : progress[d.id] || "Queued"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          {!finished ? (
            <>
              <button className="btn" onClick={onClose} disabled={running}>
                {docs.length > 1 ? "Skip" : "Cancel"}
              </button>
              <button
                className="btn primary"
                onClick={run}
                disabled={running || (mode === "custom" && !custom.trim())}
              >
                {running ? "Working…" : "Summarise"}
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
