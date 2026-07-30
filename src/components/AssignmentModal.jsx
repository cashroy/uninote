import React, { useMemo, useState } from "react";
import { PencilLine } from "lucide-react";

const api = window.uninote;

// Add a standalone assignment or exam (a dated item, no generated material).
export default function AssignmentModal({ lib, filterSemId, onClose, refresh }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("assignment");
  const [paperId, setPaperId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const paperOptions = useMemo(() => {
    const out = [];
    for (const y of lib.years)
      for (const s of y.semesters) {
        if (filterSemId && s.id !== filterSemId) continue;
        for (const p of s.papers) out.push({ id: p.id, semId: s.id, label: `${y.name} · ${s.name} · ${p.code}` });
      }
    return out;
  }, [lib, filterSemId]);

  const chosen = paperOptions.find((o) => o.id === paperId);
  const semId = chosen?.semId || filterSemId || null;

  return (
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2><PencilLine size={18} /> New assignment</h2>
        <p className="modal-sub">Add an assignment or exam. It shows up in Deadlines and on your Calendar, and can be exported.</p>
        <input className="text-input" placeholder="Name, e.g. STAT201 Assignment 2" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="field-row">
          <div className="field">
            <h3 className="modal-h3">Type</h3>
            <select className="text-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="assignment">Assignment</option>
              <option value="exam">Exam</option>
            </select>
          </div>
          <div className="field">
            <h3 className="modal-h3">Due date</h3>
            <input type="date" className="text-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <h3 className="modal-h3">Paper (optional)</h3>
        <select className="text-input" value={paperId} onChange={(e) => setPaperId(e.target.value)}>
          <option value="">— none —</option>
          {paperOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="btn primary"
            disabled={!name.trim() || !dueDate || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await api.addAssignment(semId, paperId || null, name, dueDate, kind);
                await refresh();
                onClose(true);
              } catch (err) {
                alert("Couldn't add: " + (err.message || err));
                setSaving(false);
              }
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
