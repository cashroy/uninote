import React, { useState } from "react";
import { fileIcon, fmtDate, dueInfo, CATEGORY_ICONS, WEEKS } from "../util.js";
import MarkdownModal from "./MarkdownModal.jsx";
import SummarizeDialog from "./SummarizeDialog.jsx";
import FormulaSheetModal from "./FormulaSheetModal.jsx";
import NoteEditor from "./NoteEditor.jsx";
import Scratchpad from "./Scratchpad.jsx";
import FlashcardReview from "./FlashcardReview.jsx";
import DocumentViewer from "./DocumentViewer.jsx";

const api = window.uninote;

const isFlashcardSummary = (s) => /flashcard/i.test(s.mode);

function DocCard({ doc, refresh, onView, onSummarize, onEditNote, onReview, onOpenDoc }) {
  const due = dueInfo(doc.dueDate);
  return (
    <div className="doc-card">
      <div className="doc-main" onClick={() => (doc.isNote ? onEditNote(doc) : onOpenDoc(doc))} title={doc.isNote ? "Edit note" : "View document"}>
        <span className="doc-icon">{doc.isNote ? "🗒️" : fileIcon(doc.fileName)}</span>
        <div className="doc-meta">
          <div className="doc-name">{doc.fileName}</div>
          <div className="doc-date">
            {fmtDate(doc.uploadedAt)}
            {due && (
              <span className={`due-badge ${due.overdue ? "overdue" : due.days <= 3 ? "soon" : ""}`}>
                {" "}· {due.label}
              </span>
            )}
          </div>
        </div>
        <select
          className="week-select"
          title="Week"
          value={doc.week ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={async (e) => {
            await api.setDocMeta(doc.id, { week: e.target.value ? Number(e.target.value) : null });
            await refresh();
          }}
        >
          <option value="">Wk —</option>
          {WEEKS.map((w) => (
            <option key={w} value={w}>Wk {w}</option>
          ))}
        </select>
      </div>

      {doc.summaries.length > 0 && (
        <div className="doc-summaries">
          {doc.summaries.map((s) => (
            <span key={s.id} className="summary-chip-group">
              <button className="summary-chip" title="View summary" onClick={() => onView({ title: s.fileName, absPath: s.absPath })}>
                ✨ {s.mode}
              </button>
              {isFlashcardSummary(s) && (
                <button className="summary-chip play" title="Review flashcards" onClick={() => onReview(s)}>
                  ▶
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="doc-actions">
        {doc.category === "Assignments" && (
          <input
            type="date"
            className="date-input"
            title="Due date"
            value={doc.dueDate || ""}
            onChange={async (e) => {
              await api.setDocMeta(doc.id, { dueDate: e.target.value || null });
              await refresh();
            }}
          />
        )}
        {doc.isNote && (
          <button className="btn tiny" onClick={() => onEditNote(doc)}>✏️ Edit</button>
        )}
        <button className="btn tiny" onClick={() => onSummarize(doc)}>✨ Summarise</button>
        <button
          className="btn tiny danger"
          onClick={async () => {
            if (confirm(`Delete "${doc.fileName}" and its summaries?`)) {
              await api.deleteDoc(doc.id);
              await refresh();
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function PaperView({ lib, paperId, refresh, onUpload }) {
  const [viewing, setViewing] = useState(null); // {title, absPath}
  const [summarizing, setSummarizing] = useState(null); // doc
  const [editingNote, setEditingNote] = useState(null); // doc | "new"
  const [reviewing, setReviewing] = useState(null); // summary
  const [viewingDoc, setViewingDoc] = useState(null); // doc opened in viewer
  const [weekFilter, setWeekFilter] = useState(null); // number | "none" | null
  const [formulaSheet, setFormulaSheet] = useState(false);

  let paper = null;
  let crumbs = "";
  for (const y of lib.years)
    for (const s of y.semesters) {
      const p = s.papers.find((p) => p.id === paperId);
      if (p) {
        paper = p;
        crumbs = `${y.name} / ${s.name}`;
      }
    }
  if (!paper) return <div className="empty-state">Paper not found.</div>;

  const docs = lib.docs.filter((d) => d.paperId === paperId);
  const weeksPresent = [...new Set(docs.map((d) => d.week).filter((w) => w != null))].sort(
    (a, b) => a - b
  );
  const filtered = docs.filter((d) => {
    if (weekFilter === null) return true;
    if (weekFilter === "none") return d.week == null;
    return d.week === weekFilter;
  });

  const byCategory = {};
  for (const d of filtered) (byCategory[d.category] || (byCategory[d.category] = [])).push(d);

  // Render categories in the known order, then any leftover (e.g. a just-added
  // custom category) so nothing a user files is ever hidden.
  const orderedCats = [
    ...lib.categories.filter((c) => byCategory[c]?.length),
    ...Object.keys(byCategory).filter((c) => !lib.categories.includes(c)),
  ];

  return (
    <div className="paper-layout">
      <div className="view">
        <header className="view-header">
          <div>
            <div className="crumbs">{crumbs}</div>
            <h1>
              {paper.code} {paper.name && <span className="subtitle">{paper.name}</span>}
            </h1>
          </div>
          <div className="header-actions">
            <button className="btn" onClick={() => setEditingNote("new")}>
              🗒️ New note
            </button>
            <button className="btn" onClick={() => setFormulaSheet(true)} title="Make or update an AI formula sheet from everything in this paper">
              📐 Formula sheet
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                const paths = await api.pickFiles();
                if (paths.length) onUpload(paths);
              }}
            >
              ⬆ Upload notes
            </button>
          </div>
        </header>

        {weeksPresent.length > 0 && (
          <div className="week-filter">
            <button className={`week-chip ${weekFilter === null ? "active" : ""}`} onClick={() => setWeekFilter(null)}>
              All weeks
            </button>
            {weeksPresent.map((w) => (
              <button key={w} className={`week-chip ${weekFilter === w ? "active" : ""}`} onClick={() => setWeekFilter(weekFilter === w ? null : w)}>
                Week {w}
              </button>
            ))}
            <button className={`week-chip ${weekFilter === "none" ? "active" : ""}`} onClick={() => setWeekFilter(weekFilter === "none" ? null : "none")}>
              Unassigned
            </button>
          </div>
        )}

        {docs.length === 0 && (
          <div className="empty-state">
            <p>
              Nothing here yet. <strong>Drag files anywhere into the window</strong>, click
              “Upload notes”, or start a <strong>note</strong> right inside UniNote — Claude files
              uploads automatically (lecture notes, workshop, assignment…).
            </p>
          </div>
        )}

        {orderedCats
          .map((cat) => (
            <section key={cat} className="category-section">
              <h2>
                <span className="cat-icon">{CATEGORY_ICONS[cat] || "📁"}</span> {cat}
                <span className="cat-count">{byCategory[cat].length}</span>
              </h2>
              <div className="doc-grid">
                {byCategory[cat]
                  .slice()
                  .sort((a, b) => (a.week ?? 99) - (b.week ?? 99))
                  .map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      refresh={refresh}
                      onView={setViewing}
                      onSummarize={setSummarizing}
                      onEditNote={setEditingNote}
                      onReview={setReviewing}
                      onOpenDoc={setViewingDoc}
                    />
                  ))}
              </div>
            </section>
          ))}
      </div>

      <Scratchpad paperId={paperId} />

      {viewing && <MarkdownModal title={viewing.title} absPath={viewing.absPath} onClose={() => setViewing(null)} />}
      {summarizing && (
        <SummarizeDialog
          docs={[summarizing]}
          onClose={async () => {
            setSummarizing(null);
            await refresh();
          }}
        />
      )}
      {editingNote && (
        <NoteEditor
          doc={editingNote === "new" ? null : editingNote}
          paperId={paperId}
          onClose={async () => {
            setEditingNote(null);
            await refresh();
          }}
        />
      )}
      {reviewing && <FlashcardReview summary={reviewing} onClose={() => setReviewing(null)} />}
      {viewingDoc && <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />}
      {formulaSheet && (
        <FormulaSheetModal paperId={paperId} paperLabel={paper.code} onClose={() => setFormulaSheet(false)} />
      )}
    </div>
  );
}
