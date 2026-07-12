import React, { useEffect, useRef, useState } from "react";
import { md } from "../util.js";

const api = window.uninote;

// Per-paper AI formula sheet — generate once, regenerate to update it in place.
export default function FormulaSheetModal({ paperId, paperLabel, onClose }) {
  const [content, setContent] = useState(null); // saved sheet ("" once loaded)
  const [live, setLive] = useState(""); // streaming text while generating
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const liveRef = useRef("");

  useEffect(() => {
    (async () => {
      try { setContent(await api.getFormulaSheet(paperId)); } catch { setContent(""); }
    })();
  }, [paperId]);

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
    const res = await api.generateFormulaSheet(paperId);
    setRunning(false);
    if (!res.ok) { setError(res.error); return; }
    setContent(res.content);
    liveRef.current = "";
    setLive("");
  };

  const hasSheet = content && content.trim();
  const showBody = running || hasSheet;
  const body = running ? (live || "Reading your material and building the sheet…") : content;

  return (
    <div className="modal-backdrop" onClick={() => !running && onClose()}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          <h2>📐 Formula sheet — {paperLabel}</h2>
          <button className="btn tiny" onClick={onClose} disabled={running}>✕</button>
        </div>
        <p className="modal-sub">
          Claude reads every document in this paper and assembles one formula sheet — every formula,
          definition and key result, grouped by topic. Regenerate any time to fold in new material.
        </p>
        {error && <p className="key-err">{error}</p>}
        {showBody ? (
          <div className="md-body" style={{ maxHeight: "58vh", overflowY: "auto" }} dangerouslySetInnerHTML={md(body)} />
        ) : (
          content !== null && (
            <div className="empty-state"><p>No formula sheet yet — hit <strong>Generate</strong> and Claude will build one from this paper's material.</p></div>
          )
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={running}>Close</button>
          <button className="btn primary" onClick={run} disabled={running || content === null}>
            {running ? "Building…" : hasSheet ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
