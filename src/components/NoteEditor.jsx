import React, { useEffect, useRef, useState } from "react";
import { md } from "../util.js";

const api = window.uninote;

// Markdown editor with live preview + autosave.
// Pass `doc` to edit an existing note, or `paperId` (no doc) to create one.
export default function NoteEditor({ doc, paperId, onClose }) {
  const [title, setTitle] = useState(doc ? doc.fileName.replace(/\.md$/i, "") : "");
  const [content, setContent] = useState(null);
  const [noteDoc, setNoteDoc] = useState(doc || null);
  const [saveState, setSaveState] = useState("saved"); // saved | dirty | saving
  const timer = useRef(null);

  useEffect(() => {
    (async () => {
      if (doc) setContent(await api.readFile(doc.absPath));
      else setContent("");
    })();
  }, []);

  // debounce autosave; note is created lazily on first save when new
  const scheduleSave = (next) => {
    setContent(next);
    setSaveState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 800);
  };

  const persist = async (text) => {
    setSaveState("saving");
    try {
      if (noteDoc) {
        await api.saveNote(noteDoc.id, text);
      } else {
        const created = await api.createNote(paperId, title.trim() || "Untitled note", text);
        setNoteDoc(created);
      }
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
    }
  };

  const close = async () => {
    clearTimeout(timer.current);
    if (content !== null && (saveState !== "saved" || (!noteDoc && content.trim()))) {
      await persist(content);
    }
    onClose();
  };

  if (content === null) return null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal editor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          {noteDoc ? (
            <h2>🗒️ {noteDoc.fileName}</h2>
          ) : (
            <input
              className="text-input title-input"
              autoFocus
              placeholder="Note title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
          <div className="editor-status-row">
            <span className={`save-state ${saveState}`}>
              {saveState === "saved" ? "Saved ✓" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed!" : "…"}
            </span>
            <button className="btn tiny" onClick={close}>✕ Close</button>
          </div>
        </div>
        <div className="editor-split">
          <textarea
            className="editor-textarea"
            placeholder="Write in Markdown — headings with #, lists with -, **bold**…"
            value={content}
            onChange={(e) => scheduleSave(e.target.value)}
          />
          <div className="md-body editor-preview" dangerouslySetInnerHTML={md(content || "*Live preview*")} />
        </div>
      </div>
    </div>
  );
}
