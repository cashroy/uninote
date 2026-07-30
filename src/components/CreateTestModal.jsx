import React, { useMemo, useState } from "react";
import { SquarePen, ClipboardList } from "lucide-react";

const api = window.uninote;

// Create a test for a single paper. Usable anywhere: pass `filterSemId` to lock
// the picker to one semester, or omit it to choose any paper in the library.
// Calls onClose(createdTest|undefined). Tests cover ONE paper at a time.
export default function CreateTestModal({ lib, filterSemId, onClose, refresh, autoGenerate, test }) {
  const editing = !!test;
  const [name, setName] = useState(test?.name || "");
  const [paperId, setPaperId] = useState(test?.paperId || "");
  const [selected, setSelected] = useState(() =>
    test ? Object.fromEntries((test.docIds || []).map((id) => [id, true])) : {}
  );
  const [pastPaperId, setPastPaperId] = useState(test?.pastPaperDocId || "");
  const [dueDate, setDueDate] = useState(test?.dueDate || "");
  const [creating, setCreating] = useState(false);

  // paper options (optionally limited to one semester), with full location labels
  const paperOptions = useMemo(() => {
    const out = [];
    for (const y of lib.years)
      for (const s of y.semesters) {
        if (filterSemId && s.id !== filterSemId) continue;
        for (const p of s.papers)
          out.push({
            id: p.id,
            semId: s.id,
            label: `${y.name} · ${s.name} · ${p.code}${p.name ? " — " + p.name : ""}`,
          });
      }
    return out;
  }, [lib, filterSemId]);

  const chosenPaper = paperOptions.find((o) => o.id === paperId);
  const paperDocs = paperId ? lib.docs.filter((d) => d.paperId === paperId) : [];

  // which docs were already covered by earlier tests for this paper, and by which
  const coveredBy = {};
  if (paperId) {
    for (const t of lib.tests.filter((t) => t.paperId === paperId))
      for (const dId of t.docIds) (coveredBy[dId] || (coveredBy[dId] = [])).push(t.name);
  }

  const chosen = Object.keys(selected).filter((k) => selected[k]);

  return (
    <div className="modal-backdrop" onClick={() => !creating && onClose()}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? <><SquarePen size={18} /> Edit test</> : <><ClipboardList size={18} /> New test</>}</h2>
        <p className="modal-sub">
          A test covers one paper. Choosing material is optional — create the test now and add or
          change what it covers later, then generate. Anything already used in an earlier test is marked.
        </p>
        <input
          className="text-input"
          placeholder="Test name, e.g. STAT201 Midterm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="field-row">
          <div className="field">
            <h3 className="modal-h3">Paper</h3>
            <select
              className="text-input"
              value={paperId}
              disabled={editing}
              onChange={(e) => { setPaperId(e.target.value); setSelected({}); setPastPaperId(""); }}
            >
              <option value="">Choose a paper…</option>
              {paperOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <h3 className="modal-h3">Test date (optional)</h3>
            <input type="date" className="text-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        {paperId && (
          <>
            <h3 className="modal-h3">Covered material</h3>
            {paperDocs.length === 0 ? (
              <p className="muted">No documents in this paper yet — upload some notes first.</p>
            ) : (
              <div className="check-list">
                {paperDocs.map((d) => (
                  <label key={d.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={!!selected[d.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [d.id]: e.target.checked }))}
                    />
                    <span>
                      {d.fileName}{" "}
                      <em className="muted">({d.category}{d.week ? ` · week ${d.week}` : ""})</em>
                      {coveredBy[d.id] && (
                        <span className="covered-badge" title={`Already covered in: ${coveredBy[d.id].join(", ")}`}>
                          already in {coveredBy[d.id].join(", ")}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <h3 className="modal-h3">Past paper (optional)</h3>
            <select className="text-input" value={pastPaperId} onChange={(e) => setPastPaperId(e.target.value)}>
              <option value="">No past paper</option>
              {paperDocs.filter((d) => d.category === "Past Papers").map((d) => (
                <option key={d.id} value={d.id}>{d.fileName}</option>
              ))}
            </select>
            <p className="hint">
              Tip: drop a past paper in first — it'll be filed under “Past Papers” and appear here.
            </p>
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={() => onClose()} disabled={creating}>Cancel</button>
          <button
            className="btn primary"
            disabled={!name.trim() || !paperId || creating}
            onClick={async () => {
              setCreating(true);
              try {
                if (editing) {
                  await api.updateTest(test.id, {
                    name, docIds: chosen, pastPaperDocId: pastPaperId || null, dueDate: dueDate || null,
                  });
                  await refresh();
                  onClose({ ...test, name, docIds: chosen, pastPaperDocId: pastPaperId || null, dueDate: dueDate || null, edited: true });
                } else {
                  const created = await api.createTest(
                    chosenPaper.semId, name, chosen, pastPaperId || null, paperId, dueDate || null
                  );
                  await refresh();
                  onClose(created);
                }
              } catch (err) {
                alert("Could not save test: " + (err.message || err));
                setCreating(false);
              }
            }}
          >
            {editing ? "Save changes" : "Create test"}
          </button>
        </div>
      </div>
    </div>
  );
}
