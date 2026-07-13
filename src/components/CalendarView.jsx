import React, { useEffect, useMemo, useRef, useState } from "react";
import { collectDeadlines } from "./DeadlinesView.jsx";
import { dueInfo, fmtDate } from "../util.js";
import { COUNTRIES, UNIVERSITIES } from "../universities.js";

const api = window.uninote;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayIndex = (d) => (d.getDay() + 6) % 7;

// ---- colour coding ----------------------------------------------------------
// Semi-transparent tints keyed by an rgb triple so a single palette reads well
// on every theme (light tint + solid accent bar, text stays the theme's ink).
const PALETTE = [
  { key: "blue", rgb: "37,99,235" },
  { key: "green", rgb: "22,163,74" },
  { key: "amber", rgb: "217,119,6" },
  { key: "red", rgb: "220,38,38" },
  { key: "purple", rgb: "147,51,234" },
  { key: "pink", rgb: "219,39,119" },
  { key: "teal", rgb: "13,148,136" },
  { key: "slate", rgb: "100,116,139" },
];

function colorFor(entry) {
  const chosen = entry.color && PALETTE.find((p) => p.key === entry.color);
  if (chosen) return chosen;
  // deterministic fallback so untagged classes still colour consistently by name
  const s = (entry.title || "").toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const cardStyle = (entry) => {
  const { rgb } = colorFor(entry);
  return {
    background: `rgba(${rgb}, 0.14)`,
    borderLeft: `3px solid rgb(${rgb})`,
  };
};

// ---- time helpers -----------------------------------------------------------
const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? (+m[1]) * 60 + (+m[2]) : null;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const PX_PER_HOUR = 56;
const PX_PER_MIN = PX_PER_HOUR / 60;
const SNAP_MIN = 15;

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
                <div key={i} className="tt-preview-row" style={cardStyle(e)}>
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
    initial || { day: "Monday", start: "09:00", end: "10:00", title: "", location: "", type: "Lecture", color: "" }
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
        <h3 className="modal-h3">Colour</h3>
        <div className="swatch-row">
          <button
            type="button"
            className={`swatch swatch-auto ${!f.color ? "sel" : ""}`}
            title="Auto (by class name)"
            onClick={() => up("color", "")}
          >Auto</button>
          {PALETTE.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`swatch ${f.color === p.key ? "sel" : ""}`}
              style={{ background: `rgb(${p.rgb})` }}
              title={p.key}
              onClick={() => up("color", p.key)}
            />
          ))}
        </div>
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

// ---- weekly time-grid -------------------------------------------------------
function WeekGrid({ entries, byDay, onEdit, onDelete, onMove }) {
  const dragRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);

  // Which day columns to show: weekdays always, weekend only if it has classes.
  const days = useMemo(() => {
    const used = new Set(entries.map((e) => e.dayIndex ?? 0));
    const list = [0, 1, 2, 3, 4];
    if (used.has(5)) list.push(5);
    if (used.has(6)) list.push(6);
    return list;
  }, [entries]);

  // Time window: bound to the actual classes, clamped to a sensible default.
  const { startMin, endMin } = useMemo(() => {
    let lo = 8 * 60, hi = 18 * 60;
    for (const e of entries) {
      const s = toMin(e.start);
      if (s == null) continue;
      const en = toMin(e.end) ?? s + 60;
      lo = Math.min(lo, s);
      hi = Math.max(hi, en);
    }
    lo = Math.max(0, Math.floor(lo / 60) * 60);
    hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
    if (hi - lo < 60) hi = lo + 60;
    return { startMin: lo, endMin: hi };
  }, [entries]);

  const totalPx = (endMin - startMin) * PX_PER_MIN;
  const hours = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);

  // Classes with no valid start can't be placed on the grid — list them below.
  const unscheduled = entries.filter((e) => toMin(e.start) == null);

  const gridCols = `52px repeat(${days.length}, minmax(0, 1fr))`;

  const onDragStart = (e, entry) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = toMin(entry.start);
    const dur = (toMin(entry.end) ?? s + 60) - s;
    dragRef.current = { id: entry.id, grabY: e.clientY - rect.top, dur };
    setDragId(entry.id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", entry.id); } catch {}
  };
  const onDragEnd = () => { dragRef.current = null; setDragId(null); setOverDay(null); };

  const onColDrop = (e, dayIndex) => {
    e.preventDefault();
    e.stopPropagation();
    const d = dragRef.current;
    setOverDay(null);
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const topPx = e.clientY - rect.top - d.grabY;
    let start = startMin + Math.round(topPx / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
    start = Math.max(startMin, Math.min(start, endMin - d.dur));
    onMove(d.id, { dayIndex, day: DAYS[dayIndex], start: toHHMM(start), end: toHHMM(start + d.dur) });
    onDragEnd();
  };

  return (
    <>
      <div className="ttg">
        <div className="ttg-head" style={{ gridTemplateColumns: gridCols }}>
          <div className="ttg-corner" />
          {days.map((di) => <div key={di} className="ttg-dayhead">{DOW[di]}</div>)}
        </div>
        <div className="ttg-body" style={{ gridTemplateColumns: gridCols, height: totalPx }}>
          <div className="ttg-gutter">
            {hours.map((m) => (
              <div key={m} className="ttg-hourlabel" style={{ top: (m - startMin) * PX_PER_MIN }}>
                {toHHMM(m)}
              </div>
            ))}
          </div>
          {days.map((di) => (
            <div
              key={di}
              className={`ttg-col ${overDay === di ? "over" : ""}`}
              onDragOver={(e) => { if (dragRef.current) { e.preventDefault(); setOverDay(di); } }}
              onDragLeave={() => setOverDay((d) => (d === di ? null : d))}
              onDrop={(e) => onColDrop(e, di)}
            >
              {hours.map((m) => (
                <div key={m} className="ttg-line" style={{ top: (m - startMin) * PX_PER_MIN }} />
              ))}
              {byDay[di].map((e) => {
                const s = toMin(e.start);
                if (s == null) return null;
                const en = toMin(e.end) ?? s + 60;
                const top = (s - startMin) * PX_PER_MIN;
                const h = Math.max(24, (en - s) * PX_PER_MIN);
                return (
                  <div
                    key={e.id}
                    className={`ttg-card ${dragId === e.id ? "dragging" : ""}`}
                    style={{ top, height: h, ...cardStyle(e) }}
                    draggable
                    onDragStart={(ev) => onDragStart(ev, e)}
                    onDragEnd={onDragEnd}
                    onClick={() => onEdit(e)}
                    title="Drag to move · click to edit"
                  >
                    <button className="tt-del" title="Remove" onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }}>×</button>
                    <div className="ttg-card-time">{e.start}{e.end ? `–${e.end}` : ""}</div>
                    <div className="ttg-card-title">{e.title}</div>
                    {e.location && <div className="ttg-card-sub">{e.location}</div>}
                    {e.type && <div className="ttg-card-sub dim">{e.type}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {unscheduled.length > 0 && (
        <div className="ttg-unscheduled">
          <span className="ttg-unscheduled-label">No time set:</span>
          {unscheduled.map((e) => (
            <button key={e.id} className="ttg-chip" style={cardStyle(e)} onClick={() => onEdit(e)} title="Click to set a time">
              {e.day} · {e.title}
            </button>
          ))}
        </div>
      )}
      <p className="hint">Drag a class to move it to another day or time. Click it to edit, or use × to remove.</p>
    </>
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
  const [country, setCountry] = useState("");
  const [university, setUniversity] = useState("");
  const [uniOther, setUniOther] = useState(false);
  const [uniBusy, setUniBusy] = useState(false);
  const [uniNote, setUniNote] = useState("");

  useEffect(() => {
    (async () => {
      const s = await api.getSettings();
      const c = s.universityCountry || "";
      const u = s.university || "";
      setCountry(c);
      setUniversity(u);
      if (u && (c === "Other" || !(UNIVERSITIES[c] || []).includes(u))) setUniOther(true);
    })();
  }, []);

  const applyUniversity = async () => {
    const uni = university.trim();
    if (!uni) return;
    setUniBusy(true);
    setUniNote("");
    await api.saveSettings({ university: uni, universityCountry: country });
    const where = country && country !== "Other" ? ` in ${country}` : "";
    const res = await api.assistTimetable(
      `I study at ${uni}${where}. Set this semester's start and end dates (termStart and termEnd) and all mid-semester/term break dates for the current academic year. Keep my existing classes exactly as they are.`
    );
    setUniBusy(false);
    if (!res.ok) { setUniNote("⚠️ " + res.error); return; }
    setTt({ entries: res.entries, termStart: res.termStart, termEnd: res.termEnd, breaks: res.breaks });
    setUniNote(res.note || `Filled in semester and break dates for ${uni}.`);
  };

  const loadTT = async () => setTt(await api.getTimetable());
  // reload when the library refreshes too, so chat-driven calendar edits show up
  useEffect(() => { loadTT(); }, [lib]);

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
                  <div key={c.id} className="cal-chip klass" style={cardStyle(c)} title={`${c.title}${c.location ? " · " + c.location : ""}`}>
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

      {/* university */}
      <section className="category-section">
        <h2>🎓 Your university</h2>
        <p className="hint">
          Pick your university and UniNote asks your AI to fill in this semester's start, end and
          break dates. It won't change unless you choose a different one.
        </p>
        <div className="field-row">
          <div className="field">
            <h3 className="modal-h3">Country / region</h3>
            <select
              className="text-input"
              value={country}
              onChange={(e) => { setCountry(e.target.value); setUniversity(""); setUniOther(e.target.value === "Other"); }}
            >
              <option value="">Choose…</option>
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              <option value="Other">Other…</option>
            </select>
          </div>
          <div className="field">
            <h3 className="modal-h3">University</h3>
            {country && country !== "Other" && !uniOther ? (
              <select
                className="text-input"
                value={university}
                onChange={(e) => {
                  if (e.target.value === "__other__") { setUniOther(true); setUniversity(""); }
                  else setUniversity(e.target.value);
                }}
              >
                <option value="">Choose…</option>
                {(UNIVERSITIES[country] || []).map((u) => <option key={u}>{u}</option>)}
                <option value="__other__">Other…</option>
              </select>
            ) : (
              <input
                className="text-input"
                placeholder="Type your university"
                value={university}
                disabled={!country}
                onChange={(e) => setUniversity(e.target.value)}
              />
            )}
          </div>
        </div>
        <div className="tt-assist" style={{ marginTop: 6 }}>
          <button className="btn primary" disabled={!university.trim() || uniBusy} onClick={applyUniversity}>
            {uniBusy ? "Fetching dates…" : "Apply & fill semester dates"}
          </button>
        </div>
        {uniNote && <div className="tt-note">{uniNote}</div>}
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
          <WeekGrid
            entries={tt.entries}
            byDay={byDay}
            onEdit={(e) => setEditing(e)}
            onDelete={async (idv) => { await api.removeTimetableEntry(idv); loadTT(); }}
            onMove={async (idv, patch) => { await api.updateTimetableEntry(idv, patch); loadTT(); }}
          />
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
