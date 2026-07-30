import React, { useMemo, useState } from "react";
import { fmtDate } from "../util.js";
import { FileIcon, CategoryIcon } from "../icons.jsx";
import DocumentViewer from "./DocumentViewer.jsx";

// A single place to browse every document in the library, across all papers.
export default function AllDocsView({ lib, setSel }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [viewing, setViewing] = useState(null);

  const loc = useMemo(() => {
    const m = {};
    for (const y of lib.years)
      for (const s of y.semesters)
        for (const p of s.papers)
          m[p.id] = { yearId: y.id, semId: s.id, label: `${y.name} · ${s.name} · ${p.code}` };
    return m;
  }, [lib]);

  const cats = useMemo(
    () => [...new Set(lib.docs.map((d) => d.category))].sort(),
    [lib]
  );

  const docs = useMemo(() => {
    const ql = q.toLowerCase().trim();
    return lib.docs
      .filter((d) => cat === "all" || d.category === cat)
      .filter((d) => !ql || d.fileName.toLowerCase().includes(ql))
      .sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
  }, [lib, q, cat]);

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <div className="crumbs">Everything in one place</div>
          <h1>All documents</h1>
        </div>
      </header>

      <div className="alldocs-controls">
        <input
          className="text-input alldocs-search"
          placeholder="Filter by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="text-input alldocs-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All types ({lib.docs.length})</option>
          {cats.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {docs.length === 0 ? (
        <div className="empty-state"><p>No documents match.</p></div>
      ) : (
        <div className="alldocs-table">
          {docs.map((d) => {
            const l = loc[d.paperId];
            return (
              <div key={d.id} className="alldocs-row">
                <span className="doc-icon" onClick={() => setViewing(d)}>
                  <FileIcon fileName={d.fileName} isNote={d.isNote} size={20} />
                </span>
                <div className="alldocs-main" onClick={() => setViewing(d)}>
                  <div className="alldocs-name">{d.fileName}</div>
                  <div className="alldocs-sub">
                    <span className="cat-tag"><CategoryIcon category={d.category} size={13} /> {d.category}</span>
                    {d.week ? <span className="cat-tag">Week {d.week}</span> : null}
                    {l && (
                      <span
                        className="alldocs-loc"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSel({ kind: "paper", paperId: d.paperId, semId: l.semId, yearId: l.yearId });
                        }}
                      >
                        {l.label} →
                      </span>
                    )}
                  </div>
                </div>
                <div className="alldocs-date">{fmtDate(d.uploadedAt)}</div>
                <button className="btn tiny" onClick={() => setViewing(d)}>View</button>
              </div>
            );
          })}
        </div>
      )}

      {viewing && <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
