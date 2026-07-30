import React, { useEffect, useState } from "react";
import { md } from "../util.js";
import { X } from "lucide-react";

const api = window.uninote;

export default function MarkdownModal({ title, absPath, onClose }) {
  const [content, setContent] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setContent(await api.readFile(absPath));
      } catch (err) {
        setContent("Could not read file: " + (err.message || err));
      }
    })();
  }, [absPath]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          <h2>{title}</h2>
          <div>
            <button className="btn tiny" onClick={() => api.openFile(absPath)}>
              Open in default app
            </button>{" "}
            <button className="btn tiny" onClick={onClose}><X size={14} /></button>
          </div>
        </div>
        <div className="md-body" dangerouslySetInnerHTML={md(content || "Loading…")} />
      </div>
    </div>
  );
}
