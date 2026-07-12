import React from "react";

const api = window.uninote;

// Minimal custom controls for the frameless window, top-right.
export default function WindowControls() {
  return (
    <div className="win-controls">
      <button className="win-btn" title="Minimise" onClick={() => api.winMinimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.3" /></svg>
      </button>
      <button className="win-btn" title="Maximise" onClick={() => api.winToggleMaximize()}>
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.3" y="1.3" width="7.4" height="7.4" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
      <button className="win-btn close" title="Close" onClick={() => api.winClose()}>
        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.3" /><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.3" /></svg>
      </button>
    </div>
  );
}
