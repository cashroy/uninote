import React, { useEffect, useState } from "react";
import { md, fileIcon } from "../util.js";

const api = window.uninote;

const ext = (name) => (name.split(".").pop() || "").toLowerCase();
const TEXTUAL = ["md", "markdown", "txt", "csv", "tex", "json", "py", "js", "ts", "java", "c", "cpp", "cs", "r", "sql", "html"];
const IMAGES = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

// In-app viewer: renders Markdown/text inline, PDFs and images via blob URLs,
// and falls back to the extracted text (plus "open externally") for Office files.
export default function DocumentViewer({ doc, onClose }) {
  const e = ext(doc.fileName);
  const [text, setText] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [fallbackText, setFallbackText] = useState(null);

  useEffect(() => {
    let url;
    (async () => {
      if (e === "md" || e === "markdown" || TEXTUAL.includes(e)) {
        setText(await api.readFile(doc.absPath));
      } else if (e === "pdf" || IMAGES.includes(e)) {
        const { mime, base64 } = await api.readBytes(doc.absPath);
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        setBlobUrl(url);
      } else {
        // docx / pptx / unknown — show extracted text if we captured any
        if (doc.textPath) {
          try {
            setFallbackText(await api.readFile(doc.textPath));
          } catch {
            setFallbackText("");
          }
        } else setFallbackText("");
      }
    })();
    return () => url && URL.revokeObjectURL(url);
  }, [doc.id]);

  const isMd = e === "md" || e === "markdown";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide tall viewer" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-titlebar">
          <h2>{fileIcon(doc.fileName)} {doc.fileName}</h2>
          <div>
            <button className="btn tiny" onClick={() => api.openFile(doc.absPath)}>Open externally</button>{" "}
            <button className="btn tiny" onClick={onClose}>✕</button>
          </div>
        </div>

        {blobUrl && e === "pdf" && <iframe title={doc.fileName} className="viewer-frame" src={blobUrl} />}
        {blobUrl && IMAGES.includes(e) && (
          <div className="viewer-image-wrap"><img className="viewer-image" src={blobUrl} alt={doc.fileName} /></div>
        )}
        {text !== null && (
          isMd ? (
            <div className="md-body" dangerouslySetInnerHTML={md(text)} />
          ) : (
            <pre className="viewer-pre">{text}</pre>
          )
        )}
        {fallbackText !== null && (
          <div className="md-body">
            <p className="muted">
              This file type can't be shown inline. Here's the text UniNote extracted from it —
              use “Open externally” for the original formatting.
            </p>
            <hr />
            {fallbackText.trim() ? (
              <pre className="viewer-pre">{fallbackText}</pre>
            ) : (
              <p className="muted">No extractable text (it may be a scanned or image-only file).</p>
            )}
          </div>
        )}
        {text === null && blobUrl === null && fallbackText === null && (
          <div className="md-body">Loading…</div>
        )}
      </div>
    </div>
  );
}
