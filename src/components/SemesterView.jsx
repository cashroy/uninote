import React, { useState } from "react";
import { fmtDate, dueInfo } from "../util.js";
import MarkdownModal from "./MarkdownModal.jsx";
import CreateTestModal from "./CreateTestModal.jsx";
import AssignmentModal from "./AssignmentModal.jsx";
import { PencilLine, ClipboardList, BookOpen, SquarePen, RotateCw, Sparkles } from "lucide-react";

const api = window.uninote;

export default function SemesterView({ lib, semId, refresh, setSel }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const [editingTest, setEditingTest] = useState(null);
  const [generating, setGenerating] = useState({});
  const [viewing, setViewing] = useState(null);

  let sem = null;
  let year = null;
  for (const y of lib.years) {
    const s = y.semesters.find((s) => s.id === semId);
    if (s) {
      sem = s;
      year = y;
    }
  }
  if (!sem) return <div className="empty-state">Semester not found.</div>;

  const tests = lib.tests.filter((t) => t.semesterId === semId);
  const docCount = (pid) => lib.docs.filter((d) => d.paperId === pid).length;

  const generate = async (testId) => {
    setGenerating((g) => ({ ...g, [testId]: true }));
    try {
      await api.generateTest(testId);
      await refresh();
    } catch (err) {
      alert("Generation failed: " + (err.message || err));
    }
    setGenerating((g) => ({ ...g, [testId]: false }));
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <div className="crumbs">{year.name}</div>
          <h1>{sem.name}</h1>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={() => setShowAssignment(true)}><PencilLine size={15} /> New assignment</button>
          <button className="btn primary" onClick={() => setShowCreate(true)}>
            <ClipboardList size={15} /> Create test
          </button>
        </div>
      </header>

      <section className="category-section">
        <h2>Papers</h2>
        {sem.papers.length === 0 && (
          <div className="empty-state"><p>No papers yet — add one from the sidebar.</p></div>
        )}
        <div className="paper-grid">
          {sem.papers.map((p) => (
            <div
              key={p.id}
              className="paper-card"
              onClick={() => setSel({ kind: "paper", paperId: p.id, semId, yearId: year.id })}
            >
              <div className="paper-code">{p.code}</div>
              {p.name && <div className="paper-title">{p.name}</div>}
              <div className="paper-count">{docCount(p.id)} document{docCount(p.id) === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="category-section">
        <h2>Tests</h2>
        {tests.length === 0 && (
          <div className="empty-state">
            <p>
              No tests yet. Create one, choose which lectures, notes and assignments it covers,
              and Claude will build study material for it — optionally matched to a past paper.
            </p>
          </div>
        )}
        <div className="test-list">
          {tests.map((t) => (
            <div key={t.id} className="test-card">
              <div className="test-head">
                <div>
                  <div className="test-name">
                    {t.name}
                    {t.paperId && (
                      <span className="test-paper-badge">
                        {sem.papers.find((p) => p.id === t.paperId)?.code || "paper removed"}
                      </span>
                    )}
                    {t.dueDate && (
                      <span className={`due-badge ${dueInfo(t.dueDate)?.overdue ? "overdue" : dueInfo(t.dueDate)?.days <= 3 ? "soon" : ""}`}>
                        {dueInfo(t.dueDate)?.label}
                      </span>
                    )}
                  </div>
                  <div className="muted">
                    {t.docIds.length} source{t.docIds.length === 1 ? "" : "s"}
                    {t.pastPaperDocId ? " · past paper attached" : ""} · created {fmtDate(t.createdAt)}
                  </div>
                  <input
                    type="date"
                    className="date-input"
                    title="Test date"
                    value={t.dueDate || ""}
                    onChange={async (e) => {
                      await api.setTestDueDate(t.id, e.target.value || null);
                      await refresh();
                    }}
                  />
                </div>
                <div className="doc-actions">
                  {t.materialPath && (
                    <button
                      className="btn tiny"
                      onClick={() => setViewing({ title: `${t.name} — Study Material`, absPath: t.materialPath })}
                    >
                      <BookOpen size={13} /> Open study material
                    </button>
                  )}
                  <button className="btn tiny" onClick={() => setEditingTest(t)}>
                    <SquarePen size={13} /> Edit / add material
                  </button>
                  <button
                    className={`btn tiny ${t.materialPath ? "" : "primary"}`}
                    disabled={generating[t.id] || t.docIds.length === 0}
                    title={t.docIds.length === 0 ? "Add some material first" : ""}
                    onClick={() => generate(t.id)}
                  >
                    {generating[t.id]
                      ? "Claude is working…"
                      : t.materialPath ? <><RotateCw size={13} /> Regenerate</> : <><Sparkles size={13} /> Generate study material</>}
                  </button>
                  <button
                    className="btn tiny danger"
                    onClick={async () => {
                      if (confirm(`Delete test "${t.name}"?`)) {
                        await api.deleteTest(t.id);
                        await refresh();
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showCreate && (
        <CreateTestModal
          lib={lib}
          filterSemId={semId}
          refresh={refresh}
          onClose={async (created) => {
            setShowCreate(false);
            // only auto-generate when the test was created with material
            if (created && created.docIds?.length) await generate(created.id);
          }}
        />
      )}
      {editingTest && (
        <CreateTestModal
          lib={lib}
          filterSemId={semId}
          refresh={refresh}
          test={editingTest}
          onClose={() => setEditingTest(null)}
        />
      )}
      {showAssignment && (
        <AssignmentModal lib={lib} filterSemId={semId} refresh={refresh} onClose={() => setShowAssignment(false)} />
      )}
      {viewing && (
        <MarkdownModal title={viewing.title} absPath={viewing.absPath} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
