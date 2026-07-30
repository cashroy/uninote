import React, { useEffect, useRef, useState } from "react";
import { md } from "../util.js";
import { FileIcon } from "../icons.jsx";
import { X, StickyNote } from "lucide-react";

const api = window.uninote;

const ext = (name) => (name.split(".").pop() || "").toLowerCase();
const TEXTUAL = ["md", "markdown", "txt", "csv", "tex", "json", "py", "js", "ts", "java", "c", "cpp", "cs", "r", "sql", "html"];
const IMAGES = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

// Custom in-app viewer: a large, resizable window that renders Markdown/text,
// PDFs and images, Word docs as formatted HTML and PowerPoints as slides, with
// a margin-notes column saved per document.
export default function DocumentViewer({ doc, onClose }) {
  const e = ext(doc.fileName);
  const [state, setState] = useState({ kind: "loading" });
  const [note, setNote] = useState(null);
  const [noteSaved, setNoteSaved] = useState(true);
  const saveTimer = useRef(null);

  useEffect(() => {
    let url;
    (async () => {
      try {
        if (e === "md" || e === "markdown") {
          setState({ kind: "md", text: await api.readFile(doc.absPath) });
        } else if (TEXTUAL.includes(e)) {
          setState({ kind: "text", text: await api.readFile(doc.absPath) });
        } else if (e === "pdf" || IMAGES.includes(e)) {
          const { mime, base64 } = await api.readBytes(doc.absPath);
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          url = URL.createObjectURL(new Blob([bytes], { type: mime }));
          setState({ kind: e === "pdf" ? "pdf" : "image", url });
        } else {
          const r = await api.renderDoc(doc.absPath);
          if (r?.kind === "html" && r.html.trim()) setState({ kind: "html", html: r.html });
          else if (r?.kind === "slides" && r.slides.length) setState({ kind: "slides", slides: r.slides });
          else {
            let ft = "";
            if (doc.textPath) { try { ft = await api.readFile(doc.textPath); } catch {} }
            setState({ kind: "fallback", text: ft });
          }
        }
      } catch (err) {
        setState({ kind: "fallback", text: "" });
      }
    })();
    return () => url && URL.revokeObjectURL(url);
  }, [doc.id]);

  useEffect(() => {
    (async () => { try { setNote(await api.getDocNote(doc.id)); } catch { setNote(""); } })();
    return () => clearTimeout(saveTimer.current);
  }, [doc.id]);

  const onNoteChange = (v) => {
    setNote(v);
    setNoteSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await api.saveDocNote(doc.id, v);
      setNoteSaved(true);
    }, 600);
  };

  const renderContent = () => {
    switch (state.kind) {
      case "loading":
        return <div className="md-body">Loading…</div>;
      case "md":
        return <div className="md-body" dangerouslySetInnerHTML={md(state.text)} />;
      case "text":
        return <pre className="viewer-pre">{state.text}</pre>;
      case "pdf":
        return <iframe title={doc.fileName} className="viewer-frame" src={state.url} />;
      case "image":
        return <div className="viewer-image-wrap"><img className="viewer-image" src={state.url} alt={doc.fileName} /></div>;
      case "html":
        return <div className="md-body" dangerouslySetInnerHTML={{ __html: state.html }} />;
      case "slides":
        return (
          <div className="md-body">
            {state.slides.map((s, i) => (
              <div key={i} className="viewer2-slide">
                <h4>Slide {i + 1}</h4>
                <pre>{s.trim() || "(no text on this slide)"}</pre>
              </div>
            ))}
          </div>
        );
      default: // fallback
        return (
          <div className="md-body">
            <p className="muted">
              This file type can't be shown fully inline. Here's the text UniNote extracted from it —
              use “Open externally” for the original.
            </p>
            <hr />
            {state.text?.trim()
              ? <pre className="viewer-pre">{state.text}</pre>
              : <p className="muted">No extractable text (it may be a scanned or image-only file).</p>}
          </div>
        );
    }
  };

  const isPdf = state.kind === "pdf";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="viewer2" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-titlebar viewer2-bar">
          <h2><FileIcon fileName={doc.fileName} size={18} /> {doc.fileName}</h2>
          <div>
            <button className="btn tiny" onClick={() => api.openFile(doc.absPath)}>Open externally</button>{" "}
            <button className="btn tiny" onClick={onClose}><X size={14} /></button>
          </div>
        </div>
        <div className="viewer2-body">
          <div className={`viewer2-content ${isPdf ? "pdf" : ""}`}>{renderContent()}</div>
          <div className="viewer2-margin">
            <div className="viewer2-margin-head">
              <span><StickyNote size={14} /> Margin notes</span>
              <span className={`viewer2-saved ${noteSaved ? "ok" : ""}`}>{noteSaved ? "saved" : "saving…"}</span>
            </div>
            <textarea
              className="viewer2-margin-text"
              value={note ?? ""}
              onChange={(ev) => onNoteChange(ev.target.value)}
              placeholder="Jot notes about this material — like a margin. Saved automatically, kept with the document."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
