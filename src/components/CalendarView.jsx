import React, { useEffect, useMemo, useState } from "react";
import { collectDeadlines } from "./DeadlinesView.jsx";
import { dueInfo, fmtDate } from "../util.js";

const api = window.uninote;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayIndex = (d) => (d.getDay() + 6) % 7;

// ---- timetable import modal -------------------------------------------------
function TimetableImport({ existing, onClose, onSaved }) {
  const [phase, setPhase] = useState("start");
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");

  const run = async () => {
    const paths = await api.pickFiles();
    if (!paths.length) return;
    setPhase("parsing");
    const res = await api.parseTimetableFile(paths[0]);
    if (!res.ok) { setError(res.error); setPhase("error"); return; }
    if (!res.entries.length) { setError("Claude couldn't find any classes in that file."); setPhase("error"); return; }
    setEntries(res.entries);
    setPhase("preview");
  };

  const save = async (mode) => {
    await api.saveTimetable(mode === "add" ? [...existing, ...entries] : entries);
    onSaved();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={() => phase !== "parsing" && onClose()}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>📅 Import timetable</h2>
        {phase === "start" && (
          <>
            <p className="modal-sub">Upload your timetable and Claude reads the classes out of it. PDF, Excel, Word or text work best.</p>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={run}>Choose file…</button>
            </div>
          </>
        )}
        {phase === "parsing" && <p className="modal-sub">Reading your timetable with Claude…</p>}
        {phase === "error" && (
          <>
            <p className="key-err">{error}</p>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Close</button>
              <button className="btn primary" onClick={() => setPhase("start")}>Try another file</button>
            </div>
          </>
        )}
        {phase === "preview" && (
          <>
            <p className="modal-sub">Claude found {entries.length} classes. Save them?</p>
            <div className="check-list">
              {entries.map((e, i) => (
                <div key={i} className="tt-preview-row">
                  <strong>{e.day}</strong> {e.start}{e.end ? `–${e.end}` : ""} · {e.title}
                  {e.location ? ` · ${e.location}` : ""}{e.type ? ` (${e.type})` : ""}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Cancel</button>
              {existing.length > 0 && <button className="btn" onClick={() => save("add")}>Add to existing</button>}
              <button className="btn primary" onClick={() => save("replace")}>{existing.length > 0 ? "Replace timetable" : "Save timetable"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- add / edit a class -----------------------------------------------------
function EntryForm({ initial, onSubmit, onClose }) {
  const [f, setF] = useState(
    initial || { day: "Monday", start: "09:00", end: "10:00", title: "", location: "", type: "Lecture" }
  );
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "Edit class" : "Add a class"}</h2>
        <div className="field-row">
          <div className="field">
            <h3 className="modal-h3">Day</h3>
            <select className="text-input" value={f.day} onChange={(e) => up("day", e.target.value)}>
              {DAYS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="field">
            <h3 className="modal-h3">Type</h3>
            <input className="text-input" value={f.type} onChange={(e) => up("type", e.target.value)} placeholder="Lecture / Lab / Break…" />
          </div>
        </div>
        <div className="field-row">
          <div className="field"><h3 className="modal-h3">Start</h3><input type="time" className="text-input" value={f.start} onChange={(e) => up("start", e.target.value)} /></div>
          <div className="field"><h3 className="modal-h3">End</h3><input type="time" className="text-input" value={f.end} onChange={(e) => up("end", e.target.value)} /></div>
        </div>
        <h3 className="modal-h3">Class / paper</h3>
        <input className="text-input" value={f.title} onChange={(e) => up("title", e.target.value)} placeholder="e.g. STAT201 Lecture" autoFocus />
        <h3 className="modal-h3">Location (optional)</h3>
        <input className="text-input" value={f.location} onChange={(e) => up("location", e.target.value)} placeholder="Room / building" />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!f.title.trim()} onClick={async () => { await onSubmit(f); onClose(); }}>
            {initial ? "Save" : "Add class"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarView({ lib, setSel }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [tt, setTt] = useState({ entries: [], termStart: null, termEnd: null, breaks: [] });
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(null); // "new" | entry
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  const loadTT = async () => setTt(await api.getTimetable());
  useEffect(() => { loadTT(); }, []);

  const deadlinesByDate = useMemo(() => {
    const map = {};
    for (const d of collectDeadlines(lib)) (map[d.dueDate] || (map[d.dueDate] = [])).push(d);
    return map;
  }, [lib]);

  const byDay = useMemo(() => {
    const m = {};
    for (let i = 0; i < 7; i++) m[i] = [];
    for (const e of tt.entries) m[e.dayIndex ?? 0].push(e);
    for (let i = 0; i < 7; i++) m[i].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    return m;
  }, [tt]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - mondayIndex(first));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);

  const inBreak = (dIso) => (tt.breaks || []).find((b) => dIso >= b.start && dIso <= b.end);
  const withinTerm = (dIso) => tt.termStart && tt.termEnd && dIso >= tt.termStart && dIso <= tt.termEnd;
  const classesOn = (d) => {
    const di = iso(d);
    if (!withinTerm(di) || inBreak(di)) return [];
    return byDay[mondayIndex(d)] || [];
  };

  const move = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  const runAssist = async () => {
    const instruction = ask.trim();
    if (!instruction) return;
    setAsking(true);
    setNote("");
    const res = await api.assistTimetable(instruction);
    setAsking(false);
    if (!res.ok) { setNote("⚠️ " + res.error); return; }
    setTt({ entries: res.entries, termStart: res.termStart, termEnd: res.termEnd, breaks: res.breaks });
    setNote(res.note || "Done.");
    setAsk("");
  };

  const setDates = async (patch) => setTt(await api.setTimetableMeta(patch));

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <div className="crumbs">Your schedule</div>
          <h1>Calendar</h1>
        </div>
      </header>

      {/* month view */}
      <section className="category-section">
        <div className="cal-toolbar">
          <button className="btn tiny" onClick={() => move(-1)}>‹</button>
          <h2 className="cal-month">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
          <button className="btn tiny" onClick={() => move(1)}>›</button>
          <button className="btn tiny" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
          <div className="cal-legend">
            <span className="lg test">test</span>
            <span className="lg assignment">assignment</span>
            <span className="lg klass">class</span>
          </div>
        </div>
        <div className="cal-grid">
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = iso(d) === iso(today);
            const brk = inBreak(iso(d));
            const deadlines = deadlinesByDate[iso(d)] || [];
            const classes = classesOn(d);
            return (
              <div key={i} className={`cal-cell ${inMonth ? "" : "dim"} ${isToday ? "today" : ""} ${brk ? "break" : ""}`}>
                <div className="cal-num">{d.getDate()}</div>
                {brk && inMonth && <div className="cal-break">{brk.label || "Break"}</div>}
                {deadlines.map((it, k) => {
                  const info = dueInfo(it.dueDate);
                  return (
                    <button key={"d" + k} className={`cal-chip ${it.kind} ${info?.overdue ? "overdue" : ""}`} title={`${it.title} — ${it.where}`} onClick={() => setSel(it.nav)}>
                      {it.icon} {it.title}
                    </button>
                  );
                })}
                {classes.map((c) => (
                  <div key={c.id} className="cal-chip klass" title={`${c.title}${c.location ? " · " + c.location : ""}`}>
                    {c.start} {c.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* AI assistant */}
      <section className="category-section">
        <h2>🤖 Ask Claude to adjust your timetable</h2>
        <div className="tt-assist">
          <input
            className="text-input"
            placeholder='e.g. "add a lunch break 12–1 every weekday", "semester ends 14 June", "add my uni’s mid-semester break"'
            value={ask}
            disabled={asking}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runAssist()}
          />
          <button className="btn primary" disabled={asking || !ask.trim()} onClick={runAssist}>
            {asking ? "Working…" : "Send"}
          </button>
        </div>
        {note && <div className="tt-note">{note}</div>}
        <p className="hint">
          Set your university in Settings and Claude can try to fill in semester and break dates for
          you (best-effort — check them). Once a semester end date is set, classes stop showing after
          it and skip break weeks.
        </p>
      </section>

      {/* semester dates */}
      <section className="category-section">
        <div className="cal-toolbar">
          <h2 style={{ flex: 1 }}>Semester</h2>
          <label className="dates-label">Start
            <input type="date" className="date-input" value={tt.termStart || ""} onChange={(e) => setDates({ termStart: e.target.value || null })} />
          </label>
          <label className="dates-label">End
            <input type="date" className="date-input" value={tt.termEnd || ""} onChange={(e) => setDates({ termEnd: e.target.value || null })} />
          </label>
        </div>
        {tt.breaks?.length > 0 && (
          <div className="break-list">
            {tt.breaks.map((b, i) => (
              <span key={i} className="break-pill">
                {b.label || "Break"}: {fmtDate(b.start)} – {fmtDate(b.end)}
                <button className="break-x" title="Remove" onClick={() => setDates({ breaks: tt.breaks.filter((_, k) => k !== i) })}>×</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* weekly timetable */}
      <section className="category-section">
        <div className="cal-toolbar">
          <h2 style={{ flex: 1 }}>Weekly timetable</h2>
          {tt.entries.length > 0 && (
            <button className="btn tiny danger" onClick={async () => { if (confirm("Clear the whole timetable?")) { await api.saveTimetable([]); loadTT(); } }}>Clear all</button>
          )}
          <button className="btn" onClick={() => setEditing("new")}>＋ Add class</button>
          <button className="btn primary" onClick={() => setImporting(true)}>⬆ Import timetable</button>
        </div>
        {tt.entries.length === 0 ? (
          <div className="empty-state">
            <p>No timetable yet. <strong>Import</strong> yours (PDF, Excel, Word or text), add classes by hand, or just ask
              Claude above to build one.</p>
          </div>
        ) : (
          <div className="tt-grid">
            {DAYS.map((day, di) => (
              <div key={day} className="tt-col">
                <div className="tt-day">{DOW[di]}</div>
                {byDay[di].length === 0 ? (
                  <div className="tt-empty">—</div>
                ) : (
                  byDay[di].map((e) => (
                    <div key={e.id} className="tt-entry" onClick={() => setEditing(e)} title="Edit">
                      <button className="tt-del" title="Remove" onClick={async (ev) => { ev.stopPropagation(); await api.removeTimetableEntry(e.id); loadTT(); }}>×</button>
                      <div className="tt-time">{e.start}{e.end ? `–${e.end}` : ""}</div>
                      <div className="tt-title">{e.title}</div>
                      {e.location && <div className="tt-loc">{e.location}</div>}
                      {e.type && <div className="tt-type">{e.type}</div>}
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {importing && <TimetableImport existing={tt.entries} onClose={() => setImporting(false)} onSaved={loadTT} />}
      {editing && (
        <EntryForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSubmit={async (f) => {
            if (editing === "new") await api.addTimetableEntry(f);
            else await api.updateTimetableEntry(editing.id, f);
            loadTT();
          }}
        />
      )}
    </div>
  );
}
