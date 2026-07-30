import React, { useMemo, useState } from "react";
import { dueInfo, fmtDate } from "../util.js";
import CreateTestModal from "./CreateTestModal.jsx";
import AssignmentModal from "./AssignmentModal.jsx";
import { PencilLine, ClipboardList, GraduationCap, TriangleAlert } from "lucide-react";

const api = window.uninote;

// Collects every dated item: tests with dueDate + docs (assignments etc.) with dueDate.
export function collectDeadlines(lib) {
  const paperLoc = {};
  const semLoc = {};
  for (const y of lib.years)
    for (const s of y.semesters) {
      semLoc[s.id] = { yearId: y.id, semId: s.id, label: `${y.name} · ${s.name}` };
      for (const p of s.papers)
        paperLoc[p.id] = { ...semLoc[s.id], paperId: p.id, code: p.code };
    }

  const items = [];
  for (const d of lib.docs) {
    if (!d.dueDate) continue;
    const loc = paperLoc[d.paperId];
    items.push({
      kind: "assignment",
      icon: PencilLine,
      title: d.fileName,
      dueDate: d.dueDate,
      where: loc ? `${loc.label} · ${loc.code}` : "",
      nav: loc ? { kind: "paper", paperId: d.paperId, semId: loc.semId, yearId: loc.yearId } : { kind: "all" },
    });
  }
  for (const t of lib.tests) {
    if (!t.dueDate) continue;
    const loc = t.paperId ? paperLoc[t.paperId] : null;
    const semLocT = semLoc[t.semesterId];
    items.push({
      kind: "test",
      icon: ClipboardList,
      title: t.name,
      dueDate: t.dueDate,
      where: loc ? `${loc.label} · ${loc.code}` : semLocT ? semLocT.label : "",
      nav: semLocT
        ? { kind: "semester", semId: t.semesterId, yearId: semLocT.yearId }
        : { kind: "all" },
    });
  }
  for (const a of lib.assignments || []) {
    if (!a.dueDate) continue;
    const loc = a.paperId ? paperLoc[a.paperId] : null;
    const semLocA = a.semesterId ? semLoc[a.semesterId] : null;
    items.push({
      kind: a.kind === "exam" ? "exam" : "assignment",
      icon: a.kind === "exam" ? GraduationCap : PencilLine,
      title: a.name,
      dueDate: a.dueDate,
      assignmentId: a.id,
      where: loc ? `${loc.label} · ${loc.code}` : semLocA ? semLocA.label : "",
      nav: loc
        ? { kind: "paper", paperId: a.paperId, semId: loc.semId, yearId: loc.yearId }
        : semLocA ? { kind: "semester", semId: a.semesterId, yearId: semLocA.yearId } : { kind: "all" },
    });
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function DeadlineRow({ item, setSel, onDelete }) {
  const info = dueInfo(item.dueDate);
  const Icon = item.icon;
  return (
    <div
      className={`deadline-row ${info.overdue ? "overdue" : ""}`}
      onClick={() => setSel(item.nav)}
    >
      <span className="deadline-icon">{Icon ? <Icon size={18} /> : null}</span>
      <div className="deadline-main">
        <div className="deadline-title">{item.title}</div>
        <div className="deadline-where">{item.where}</div>
      </div>
      <div className="deadline-when">
        <div className={`deadline-label ${info.overdue ? "overdue" : info.days <= 3 ? "soon" : ""}`}>
          {info.label}
        </div>
        <div className="deadline-date">{fmtDate(item.dueDate)}</div>
      </div>
      {onDelete && item.assignmentId && (
        <button
          className="break-x"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete(item.assignmentId); }}
        >×</button>
      )}
    </div>
  );
}

export default function DeadlinesView({ lib, setSel, refresh }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const items = useMemo(() => collectDeadlines(lib), [lib]);
  const overdue = items.filter((i) => dueInfo(i.dueDate).overdue);
  const upcoming = items.filter((i) => !dueInfo(i.dueDate).overdue);
  const delAssignment = async (id) => { if (confirm("Delete this item?")) { await api.removeAssignment(id); await refresh(); } };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <div className="crumbs">Stay on top of it</div>
          <h1>Deadlines</h1>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={() => setShowAssignment(true)}><PencilLine size={15} /> New assignment</button>
          <button className="btn primary" onClick={() => setShowCreate(true)}><ClipboardList size={15} /> New test</button>
        </div>
      </header>

      {items.length === 0 && (
        <div className="empty-state">
          <p>
            Nothing dated yet. Set a due date on any <strong>assignment</strong> (on its card in a
            paper), or add a <strong>test</strong> with the button above — everything dated shows up
            here, soonest first.
          </p>
        </div>
      )}

      {overdue.length > 0 && (
        <section className="category-section">
          <h2><TriangleAlert size={18} /> Overdue</h2>
          <div className="deadline-list">
            {overdue.map((i, k) => <DeadlineRow key={k} item={i} setSel={setSel} onDelete={delAssignment} />)}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="category-section">
          <h2>Upcoming</h2>
          <div className="deadline-list">
            {upcoming.map((i, k) => <DeadlineRow key={k} item={i} setSel={setSel} onDelete={delAssignment} />)}
          </div>
        </section>
      )}

      {showCreate && (
        <CreateTestModal
          lib={lib}
          refresh={refresh}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showAssignment && (
        <AssignmentModal lib={lib} refresh={refresh} onClose={() => setShowAssignment(false)} />
      )}
    </div>
  );
}
