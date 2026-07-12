import React, { useEffect, useRef, useState } from "react";

const api = window.uninote;

// Per-paper pinned scratchpad. Collapsed state persists per paper.
export default function Scratchpad({ paperId }) {
  const [open, setOpen] = useState(
    localStorage.getItem(`scratch-open-${paperId}`) !== "0"
  );
  const [content, setContent] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const timer = useRef(null);

  useEffect(() => {
    setContent(null);
    (async () => setContent(await api.getSidenote(paperId)))();
  }, [paperId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(`scratch-open-${paperId}`, next ? "1" : "0");
  };

  const change = (next) => {
    setContent(next);
    setSaveState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaveState("saving");
      await api.saveSidenote(paperId, next);
      setSaveState("saved");
    }, 700);
  };

  if (!open) {
    return (
      <button className="scratch-tab" onClick={toggle} title="Open side notes">
        📌 Side notes
      </button>
    );
  }

  return (
    <div className="scratchpad">
      <div className="scratch-head">
        <span>📌 Side notes</span>
        <span className={`save-state ${saveState}`}>
          {saveState === "saved" ? "✓" : saveState === "saving" ? "…" : "•"}
        </span>
        <button className="btn tiny" onClick={toggle}>—</button>
      </div>
      <textarea
        className="scratch-body"
        placeholder="Quick thoughts for this paper — always here while you browse it."
        value={content ?? ""}
        disabled={content === null}
        onChange={(e) => change(e.target.value)}
      />
    </div>
  );
}
