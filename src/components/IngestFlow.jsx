import React, { useEffect, useRef, useState } from "react";
import SummarizeDialog from "./SummarizeDialog.jsx";
import { fileIcon } from "../util.js";

const api = window.uninote;

// Full drop-to-filed pipeline:
//  1. pick — if no paper is selected, ask which paper the files belong to.
//  2. analyzing — extract text + ask Claude what each file looks like.
//  3. confirm — for each file, Claude's guess is shown; the user confirms or
//     picks a different type, and can add a brand-new type.
//  4. committing — file each into its chosen category.
//  5. summarize — offer to summarise the new docs.
export default function IngestFlow({ lib, sel, paths, onClose, refresh }) {
  const [paperId, setPaperId] = useState(sel.kind === "paper" ? sel.paperId : null);
  const [phase, setPhase] = useState(sel.kind === "paper" ? "analyzing" : "pick");
  const [updates, setUpdates] = useState({});
  const [analyzed, setAnalyzed] = useState([]); // [{srcPath, fileName, suggestion, reason}]
  const [choices, setChoices] = useState({}); // srcPath -> category
  const [categories, setCategories] = useState([]);
  const [adding, setAdding] = useState(null); // srcPath currently adding a new type for
  const [newName, setNewName] = useState("");
  const [newDocs, setNewDocs] = useState([]);
  const started = useRef(false);

  useEffect(() => api.onIngestUpdate((u) => setUpdates((p) => ({ ...p, [u.file]: u }))), []);

  useEffect(() => {
    if (phase !== "analyzing" || !paperId || started.current) return;
    started.current = true;
    (async () => {
      try {
        const cats = await api.getCategories();
        setCategories(cats.filter((c) => c !== "Notes"));
        const res = await api.analyzeFiles(paths);
        setAnalyzed(res);
        const initial = {};
        for (const r of res) initial[r.srcPath] = r.suggestion;
        setChoices(initial);
        setPhase("confirm");
      } catch (err) {
        alert("Couldn't read those files: " + (err.message || err));
        onClose();
      }
    })();
  }, [phase, paperId]);

  // window.prompt() is a no-op in Electron, so type creation is an inline form.
  const confirmAddType = async (srcPath) => {
    const name = newName.trim();
    if (!name) return;
    const cats = await api.addCategory(name);
    setCategories(cats.filter((c) => c !== "Notes"));
    const stored = cats.find((c) => c.toLowerCase() === name.toLowerCase()) || name;
    setChoices((ch) => ({ ...ch, [srcPath]: stored }));
    setAdding(null);
    setNewName("");
  };

  const commitAll = async () => {
    setPhase("committing");
    const docs = [];
    for (const item of analyzed) {
      const cat = choices[item.srcPath] || "Other";
      try {
        const doc = await api.commitFile(paperId, item.srcPath, cat);
        docs.push(doc);
      } catch (err) {
        console.error("commit failed", item.fileName, err);
      }
    }
    await refresh();
    setNewDocs(docs);
    setPhase("summarize");
  };

  // -- pick paper --
  if (phase === "pick") {
    const options = [];
    for (const y of lib.years)
      for (const s of y.semesters)
        for (const p of s.papers)
          options.push({ id: p.id, label: `${y.name} · ${s.name} · ${p.code}${p.name ? " — " + p.name : ""}` });
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Where do these belong?</h2>
          <p className="modal-sub">
            {paths.length} file{paths.length > 1 ? "s" : ""} dropped. Pick the paper to file them under.
          </p>
          {options.length === 0 ? (
            <p>Create a year, semester and paper first (use the sidebar).</p>
          ) : (
            <div className="paper-pick-list">
              {options.map((o) => (
                <button key={o.id} className="paper-pick" onClick={() => { setPaperId(o.id); setPhase("analyzing"); }}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button></div>
        </div>
      </div>
    );
  }

  // -- analyzing --
  if (phase === "analyzing") {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <h2>Reading your documents…</h2>
          <p className="modal-sub">Claude is looking at each file to work out what it is.</p>
          <div className="progress-list">
            {paths.map((p) => {
              const name = p.split(/[\\/]/).pop();
              const u = updates[name];
              let state = "Waiting…";
              if (u?.stage === "extracting") state = "Reading…";
              else if (u?.stage === "classifying") state = "Working out the type…";
              else if (u?.stage === "analyzed") state = `looks like ${u.suggestion}`;
              return (
                <div key={p} className="progress-row">
                  <span className="progress-file">{name}</span>
                  <span className="progress-state">{state}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // -- confirm types --
  if (phase === "confirm") {
    return (
      <div className="modal-backdrop">
        <div className="modal wide" onClick={(e) => e.stopPropagation()}>
          <h2>Does this look right?</h2>
          <p className="modal-sub">
            Claude guessed the type of each file. Confirm it, choose a different one, or add a new
            type.
          </p>
          <div className="confirm-list">
            {analyzed.map((item) => (
              <div key={item.srcPath} className="confirm-card">
                <span className="doc-icon">{fileIcon(item.fileName)}</span>
                <div className="confirm-main">
                  <div className="confirm-name">{item.fileName}</div>
                  <div className="confirm-guess">
                    This looks like <strong>{item.suggestion}</strong>
                    {item.reason ? ` — ${item.reason}` : ""}. Is that right?
                  </div>
                </div>
                <div className="confirm-choose">
                  {adding === item.srcPath ? (
                    <div className="add-type-form">
                      <input
                        autoFocus
                        className="text-input"
                        placeholder="New type name…"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmAddType(item.srcPath);
                          if (e.key === "Escape") { setAdding(null); setNewName(""); }
                        }}
                      />
                      <div className="add-type-actions">
                        <button className="btn tiny" onClick={() => { setAdding(null); setNewName(""); }}>Cancel</button>
                        <button className="btn tiny primary" onClick={() => confirmAddType(item.srcPath)}>Add</button>
                      </div>
                    </div>
                  ) : (
                    <select
                      className="text-input"
                      value={choices[item.srcPath] || ""}
                      onChange={(e) => {
                        if (e.target.value === "__new__") { setAdding(item.srcPath); setNewName(""); }
                        else setChoices((ch) => ({ ...ch, [item.srcPath]: e.target.value }));
                      }}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__new__">+ Add new type…</option>
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={commitAll}>File {analyzed.length} document{analyzed.length > 1 ? "s" : ""}</button>
          </div>
        </div>
      </div>
    );
  }

  // -- committing --
  if (phase === "committing") {
    return (
      <div className="modal-backdrop">
        <div className="modal"><h2>Filing…</h2><p className="modal-sub">Saving your documents into place.</p></div>
      </div>
    );
  }

  // -- summarize --
  return <SummarizeDialog docs={newDocs} onClose={async () => { await refresh(); onClose(); }} />;
}
