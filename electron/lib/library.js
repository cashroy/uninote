const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CATEGORIES = [
  "Notes",
  "Lecture Notes",
  "Workshops",
  "Tutorials",
  "Assignments",
  "Labs",
  "Readings",
  "Past Papers",
  "Other",
];

function libRoot() {
  return path.join(app.getPath("userData"), "library");
}

function dbPath() {
  return path.join(app.getPath("userData"), "library.json");
}

function textDir() {
  return path.join(app.getPath("userData"), "text");
}

function id() {
  return crypto.randomBytes(8).toString("hex");
}

function sanitize(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, "-").trim() || "untitled";
}

function load() {
  let db;
  try {
    db = JSON.parse(fs.readFileSync(dbPath(), "utf8"));
  } catch {
    db = { years: [], docs: [], tests: [] };
  }
  if (!db.flashcards) db.flashcards = {};
  if (!db.docNotes) db.docNotes = {};
  if (!db.formulaSheets) db.formulaSheets = [];
  if (!db.assignments) db.assignments = [];
  if (!db.todos) db.todos = [];
  if (!db.events) db.events = [];
  if (!db.customCategories) db.customCategories = [];
  if (!db.timetable) db.timetable = { entries: [] };
  if (!db.timetable.breaks) db.timetable.breaks = [];
  if (!("termStart" in db.timetable)) db.timetable.termStart = null;
  if (!("termEnd" in db.timetable)) db.timetable.termEnd = null;
  return db;
}

// ---- timetable (recurring weekly classes) ---------------------------------

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function dayIndexOf(name) {
  const i = DAYS.findIndex((d) => d.toLowerCase().startsWith(String(name || "").slice(0, 3).toLowerCase()));
  return i === -1 ? 0 : i;
}

function normEntry(e) {
  return {
    id: e.id || id(),
    dayIndex: e.dayIndex != null ? e.dayIndex : dayIndexOf(e.day),
    day: e.day || DAYS[e.dayIndex != null ? e.dayIndex : 0],
    start: e.start || "",
    end: e.end || "",
    title: e.title || "Class",
    location: e.location || "",
    type: e.type || "",
    color: e.color || "",
  };
}

// Full timetable object: entries + semester bounds + break ranges.
function getTimetableData() {
  const db = load();
  return {
    entries: db.timetable.entries,
    termStart: db.timetable.termStart || null,
    termEnd: db.timetable.termEnd || null,
    breaks: db.timetable.breaks || [],
  };
}

function getTimetable() {
  return load().timetable.entries;
}

// Merge semester dates / breaks without touching the class entries.
function setTimetableMeta(patch) {
  const db = load();
  if ("termStart" in patch) db.timetable.termStart = patch.termStart || null;
  if ("termEnd" in patch) db.timetable.termEnd = patch.termEnd || null;
  if ("breaks" in patch) db.timetable.breaks = patch.breaks || [];
  save(db);
  return getTimetableData();
}

// Replace the entire timetable (used by the AI assistant).
function setTimetableFull(obj) {
  const db = load();
  db.timetable = {
    entries: (obj.entries || []).map(normEntry),
    termStart: obj.termStart || null,
    termEnd: obj.termEnd || null,
    breaks: (obj.breaks || []).filter((b) => b && b.start && b.end),
  };
  save(db);
  return getTimetableData();
}

function updateTimetableEntry(entryId, patch) {
  const db = load();
  const e = db.timetable.entries.find((x) => x.id === entryId);
  if (!e) throw new Error("Class not found");
  Object.assign(e, patch);
  if ("day" in patch) e.dayIndex = dayIndexOf(patch.day);
  save(db);
  return e;
}

// Replaces the whole timetable with the given entries (assigns ids/dayIndex).
function saveTimetable(entries) {
  const db = load();
  db.timetable.entries = (entries || []).map(normEntry);
  save(db);
  return db.timetable.entries;
}

function addTimetableEntry(entry) {
  const db = load();
  const e = normEntry(entry);
  db.timetable.entries.push(e);
  save(db);
  return e;
}

function removeTimetableEntry(entryId) {
  const db = load();
  db.timetable.entries = db.timetable.entries.filter((e) => e.id !== entryId);
  save(db);
  return true;
}

// Built-in categories plus any user-added document types.
function allCategories(db) {
  const base = db || load();
  return [...CATEGORIES.slice(0, -1), ...base.customCategories, "Other"];
}

function addCategory(name) {
  const db = load();
  const clean = String(name).trim();
  if (!clean) return allCategories(db);
  const exists = allCategories(db).some((c) => c.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    db.customCategories.push(clean);
    save(db);
  }
  return allCategories(db);
}

function save(db) {
  fs.mkdirSync(path.dirname(dbPath()), { recursive: true });
  fs.writeFileSync(dbPath(), JSON.stringify(db, null, 2), "utf8");
}

function ensureRoot() {
  fs.mkdirSync(libRoot(), { recursive: true });
  fs.mkdirSync(textDir(), { recursive: true });
}

// ---- tree lookups -------------------------------------------------------

function findYear(db, yearId) {
  return db.years.find((y) => y.id === yearId);
}

function findSemester(db, semId) {
  for (const y of db.years) {
    const s = y.semesters.find((s) => s.id === semId);
    if (s) return { year: y, sem: s };
  }
  return null;
}

function findPaper(db, paperId) {
  for (const y of db.years) {
    for (const s of y.semesters) {
      const p = s.papers.find((p) => p.id === paperId);
      if (p) return { year: y, sem: s, paper: p };
    }
  }
  return null;
}

function paperDir(db, paperId) {
  const hit = findPaper(db, paperId);
  if (!hit) throw new Error("Paper not found");
  return path.join(
    libRoot(),
    sanitize(hit.year.name),
    sanitize(hit.sem.name),
    sanitize(hit.paper.code)
  );
}

function semesterDir(db, semId) {
  const hit = findSemester(db, semId);
  if (!hit) throw new Error("Semester not found");
  return path.join(libRoot(), sanitize(hit.year.name), sanitize(hit.sem.name));
}

// ---- mutations ----------------------------------------------------------

function addYear(name) {
  const db = load();
  const y = { id: id(), name: name.trim(), semesters: [] };
  db.years.push(y);
  save(db);
  fs.mkdirSync(path.join(libRoot(), sanitize(y.name)), { recursive: true });
  return y;
}

function addSemester(yearId, name) {
  const db = load();
  const y = findYear(db, yearId);
  if (!y) throw new Error("Year not found");
  const s = { id: id(), name: name.trim(), papers: [] };
  y.semesters.push(s);
  save(db);
  fs.mkdirSync(path.join(libRoot(), sanitize(y.name), sanitize(s.name)), {
    recursive: true,
  });
  return s;
}

function addPaper(semId, code, name) {
  const db = load();
  const hit = findSemester(db, semId);
  if (!hit) throw new Error("Semester not found");
  const p = { id: id(), code: code.trim(), name: (name || "").trim() };
  hit.sem.papers.push(p);
  save(db);
  fs.mkdirSync(paperDir(db, p.id), { recursive: true });
  return p;
}

function removeNode(kind, nodeId) {
  const db = load();
  if (kind === "year") {
    const y = findYear(db, nodeId);
    if (!y) return;
    const paperIds = y.semesters.flatMap((s) => s.papers.map((p) => p.id));
    db.docs = db.docs.filter((d) => !paperIds.includes(d.paperId));
    db.formulaSheets = db.formulaSheets.filter((f) => !paperIds.includes(f.paperId));
    const semIds = y.semesters.map((s) => s.id);
    db.assignments = db.assignments.filter((a) => !paperIds.includes(a.paperId) && !semIds.includes(a.semesterId));
    db.tests = db.tests.filter((t) => !semIds.includes(t.semesterId));
    fs.rmSync(path.join(libRoot(), sanitize(y.name)), { recursive: true, force: true });
    db.years = db.years.filter((x) => x.id !== nodeId);
  } else if (kind === "semester") {
    const hit = findSemester(db, nodeId);
    if (!hit) return;
    const paperIds = hit.sem.papers.map((p) => p.id);
    db.docs = db.docs.filter((d) => !paperIds.includes(d.paperId));
    db.formulaSheets = db.formulaSheets.filter((f) => !paperIds.includes(f.paperId));
    db.assignments = db.assignments.filter((a) => a.semesterId !== nodeId && !paperIds.includes(a.paperId));
    db.tests = db.tests.filter((t) => t.semesterId !== nodeId);
    fs.rmSync(semesterDir(db, nodeId), { recursive: true, force: true });
    hit.year.semesters = hit.year.semesters.filter((s) => s.id !== nodeId);
  } else if (kind === "paper") {
    const hit = findPaper(db, nodeId);
    if (!hit) return;
    fs.rmSync(paperDir(db, nodeId), { recursive: true, force: true });
    db.docs = db.docs.filter((d) => d.paperId !== nodeId);
    db.formulaSheets = db.formulaSheets.filter((f) => f.paperId !== nodeId);
    db.assignments = db.assignments.filter((a) => a.paperId !== nodeId);
    for (const t of db.tests) t.docIds = t.docIds.filter((dId) => db.docs.some((d) => d.id === dId));
    hit.sem.papers = hit.sem.papers.filter((p) => p.id !== nodeId);
  }
  save(db);
}

// Copies a source file into the paper's category folder; registers doc.
function registerDoc(paperId, srcPath, category, extractedText) {
  const db = load();
  const dir = path.join(paperDir(db, paperId), sanitize(category));
  fs.mkdirSync(dir, { recursive: true });
  let base = sanitize(path.basename(srcPath));
  let dest = path.join(dir, base);
  let n = 1;
  while (fs.existsSync(dest)) {
    const ext = path.extname(base);
    dest = path.join(dir, `${path.basename(base, ext)} (${n++})${ext}`);
  }
  fs.copyFileSync(srcPath, dest);

  const docId = id();
  let textPath = null;
  if (extractedText && extractedText.trim()) {
    textPath = path.join(textDir(), `${docId}.txt`);
    fs.writeFileSync(textPath, extractedText, "utf8");
  }
  const doc = {
    id: docId,
    paperId,
    category,
    fileName: path.basename(dest),
    absPath: dest,
    textPath,
    summaries: [],
    uploadedAt: new Date().toISOString(),
  };
  db.docs.push(doc);
  save(db);
  return doc;
}

// ---- built-in notes -------------------------------------------------------

function createNote(paperId, title, content = "") {
  const db = load();
  const dir = path.join(paperDir(db, paperId), "Notes");
  fs.mkdirSync(dir, { recursive: true });
  let base = sanitize(title) + ".md";
  let dest = path.join(dir, base);
  let n = 1;
  while (fs.existsSync(dest)) dest = path.join(dir, `${sanitize(title)} (${n++}).md`);
  fs.writeFileSync(dest, content, "utf8");

  const docId = id();
  const textPath = path.join(textDir(), `${docId}.txt`);
  fs.writeFileSync(textPath, content, "utf8");
  const doc = {
    id: docId,
    paperId,
    category: "Notes",
    fileName: path.basename(dest),
    absPath: dest,
    textPath,
    summaries: [],
    isNote: true,
    week: null,
    dueDate: null,
    uploadedAt: new Date().toISOString(),
  };
  db.docs.push(doc);
  save(db);
  return doc;
}

function updateNote(docId, content) {
  const db = load();
  const doc = db.docs.find((d) => d.id === docId);
  if (!doc || !doc.isNote) throw new Error("Note not found");
  fs.writeFileSync(doc.absPath, content, "utf8");
  if (!doc.textPath) {
    doc.textPath = path.join(textDir(), `${doc.id}.txt`);
    save(db);
  }
  fs.writeFileSync(doc.textPath, content, "utf8");
  return true;
}

// week (number|null) and dueDate (ISO date string|null) live on the doc record
function setDocMeta(docId, patch) {
  const db = load();
  const doc = db.docs.find((d) => d.id === docId);
  if (!doc) throw new Error("Doc not found");
  if ("week" in patch) doc.week = patch.week;
  if ("dueDate" in patch) doc.dueDate = patch.dueDate;
  save(db);
  return doc;
}

// Move a document (and its summaries) to a different category, creating the
// category if it's new. Physically relocates the files within the paper folder.
function setDocCategory(docId, category) {
  const db = load();
  const doc = db.docs.find((d) => d.id === docId);
  if (!doc) throw new Error("Doc not found");
  const clean = String(category || "").trim();
  if (!clean) return doc;
  if (!allCategories(db).some((c) => c.toLowerCase() === clean.toLowerCase())) {
    db.customCategories.push(clean);
  }
  const canonical = allCategories(db).find((c) => c.toLowerCase() === clean.toLowerCase()) || clean;
  if (doc.category === canonical) { save(db); return doc; }

  const newDir = path.join(paperDir(db, doc.paperId), sanitize(canonical));
  fs.mkdirSync(newDir, { recursive: true });
  const moveFile = (absPath) => {
    if (!absPath || !fs.existsSync(absPath)) return absPath;
    const base = path.basename(absPath);
    let dest = path.join(newDir, base);
    let n = 1;
    while (fs.existsSync(dest)) {
      const ext = path.extname(base);
      dest = path.join(newDir, `${path.basename(base, ext)} (${n++})${ext}`);
    }
    try { fs.renameSync(absPath, dest); }
    catch { try { fs.copyFileSync(absPath, dest); fs.rmSync(absPath, { force: true }); } catch {} }
    return dest;
  };
  doc.absPath = moveFile(doc.absPath);
  for (const s of doc.summaries) s.absPath = moveFile(s.absPath);
  doc.category = canonical;
  save(db);
  return doc;
}

// ---- assignments / exams (dated items without generated material) ----------

function addAssignment(semesterId, paperId, name, dueDate, kind) {
  const db = load();
  const a = {
    id: id(),
    semesterId: semesterId || null,
    paperId: paperId || null,
    name: String(name || "").trim() || "Assignment",
    dueDate: dueDate || null,
    kind: kind === "exam" ? "exam" : "assignment",
  };
  db.assignments.push(a);
  save(db);
  return a;
}

function removeAssignment(assignmentId) {
  const db = load();
  db.assignments = db.assignments.filter((a) => a.id !== assignmentId);
  save(db);
  return true;
}

// ---- general todo list (not tied to a paper or semester) -------------------

function addTodo(text, dueDate) {
  const db = load();
  const t = {
    id: id(),
    text: String(text || "").trim() || "Todo",
    done: false,
    dueDate: dueDate || null,
    createdAt: new Date().toISOString(),
  };
  db.todos.push(t);
  save(db);
  return t;
}

function toggleTodo(todoId) {
  const db = load();
  const t = db.todos.find((x) => x.id === todoId);
  if (!t) return null;
  t.done = !t.done;
  save(db);
  return t;
}

function updateTodo(todoId, patch) {
  const db = load();
  const t = db.todos.find((x) => x.id === todoId);
  if (!t) return null;
  const p = patch || {};
  if ("text" in p) t.text = String(p.text || "").trim() || t.text;
  if ("dueDate" in p) t.dueDate = p.dueDate || null;
  if ("done" in p) t.done = !!p.done;
  save(db);
  return t;
}

function removeTodo(todoId) {
  const db = load();
  db.todos = db.todos.filter((t) => t.id !== todoId);
  save(db);
  return true;
}

// ---- calendar events / holidays --------------------------------------------

function addEvent(ev) {
  const db = load();
  const e = {
    id: id(),
    title: String(ev.title || "").trim() || (ev.kind === "holiday" ? "Holiday" : "Event"),
    date: ev.date,
    endDate: ev.endDate || null,
    kind: ev.kind === "holiday" ? "holiday" : "event",
    note: ev.note || "",
  };
  db.events.push(e);
  save(db);
  return e;
}

function removeEvent(eventId) {
  const db = load();
  db.events = db.events.filter((e) => e.id !== eventId);
  save(db);
  return true;
}

function addPublicHolidays(list) {
  const db = load();
  for (const h of list || []) {
    if (!h || !h.date) continue;
    if (db.events.some((e) => e.kind === "holiday" && e.date === h.date)) continue;
    db.events.push({ id: id(), title: h.title || "Public holiday", date: h.date, endDate: null, kind: "holiday", note: "" });
  }
  save(db);
  return db.events;
}

// ---- iCal (.ics) export ----------------------------------------------------

const pad2 = (n) => String(n).padStart(2, "0");
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const toMinLib = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); return m ? +m[1] * 60 + +m[2] : null; };
const toHHMMLib = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
const icsLocal = (d, hhmm) => { const [h, mi] = hhmm.split(":"); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${h}${mi}00`; };
const icsDate = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const icsStamp = (d) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
const icsEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// Recurring weekly classes, bounded by the semester and skipping break weeks.
function buildTimetableICS() {
  const db = load();
  const tt = db.timetable;
  const now = icsStamp(new Date());
  const start = tt.termStart ? parseISO(tt.termStart) : new Date();
  const end = tt.termEnd ? parseISO(tt.termEnd) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * 16);
  const breaks = (tt.breaks || []).map((b) => ({ s: parseISO(b.start), e: parseISO(b.end) }));
  const inBreak = (d) => breaks.some((b) => d >= b.s && d <= b.e);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UniNote//Timetable//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:UniNote Timetable"];
  for (const e of tt.entries) {
    const s = toMinLib(e.start);
    if (s == null) continue;
    const di = e.dayIndex ?? 0;
    const first = new Date(start);
    first.setDate(first.getDate() + ((di - ((first.getDay() + 6) % 7) + 7) % 7));
    if (first > end) continue;
    const ex = [];
    for (const cur = new Date(first); cur <= end; cur.setDate(cur.getDate() + 7)) {
      if (inBreak(cur)) ex.push(new Date(cur));
    }
    const endHHMM = toMinLib(e.end) != null ? e.end : toHHMMLib(s + 60);
    lines.push(
      "BEGIN:VEVENT", `UID:${e.id}@uninote`, `DTSTAMP:${now}`,
      `DTSTART:${icsLocal(first, e.start)}`, `DTEND:${icsLocal(first, endHHMM)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[di]};UNTIL=${icsLocal(end, "23:59")}`
    );
    if (ex.length) lines.push("EXDATE:" + ex.map((d) => icsLocal(d, e.start)).join(","));
    lines.push(`SUMMARY:${icsEsc(e.title + (e.type ? ` (${e.type})` : ""))}`);
    if (e.location) lines.push(`LOCATION:${icsEsc(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// Tests, assignments, exams and dated documents as all-day events.
function buildAssessmentsICS() {
  const db = load();
  const now = icsStamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UniNote//Assessments//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:UniNote Tests & Assignments"];
  const allDay = (uid, dateStr, title) => {
    const d = parseISO(dateStr);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    lines.push("BEGIN:VEVENT", `UID:${uid}@uninote`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${icsDate(d)}`, `DTEND;VALUE=DATE:${icsDate(next)}`, `SUMMARY:${icsEsc(title)}`, "END:VEVENT");
  };
  for (const t of db.tests) if (t.dueDate) allDay(`test-${t.id}`, t.dueDate, `Test: ${t.name}`);
  for (const a of db.assignments) if (a.dueDate) allDay(`asgn-${a.id}`, a.dueDate, `${a.kind === "exam" ? "Exam" : "Assignment"}: ${a.name}`);
  for (const d of db.docs) if (d.dueDate) allDay(`doc-${d.id}`, d.dueDate, `Due: ${d.fileName}`);
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ---- per-paper scratchpad -------------------------------------------------

function sidenotePath(paperId) {
  const db = load();
  return path.join(paperDir(db, paperId), "_Scratchpad.md");
}

function getSidenote(paperId) {
  try {
    return fs.readFileSync(sidenotePath(paperId), "utf8");
  } catch {
    return "";
  }
}

function saveSidenote(paperId, content) {
  const p = sidenotePath(paperId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return true;
}

// ---- per-paper formula sheet (AI generated, regenerated in place) ----------

// Multiple named, scoped formula sheets per paper. Files live in the paper's
// Notes folder; records are tracked in db.formulaSheets.
function listFormulaSheets(paperId) {
  return load().formulaSheets.filter((f) => f.paperId === paperId);
}

function addFormulaSheet(paperId, title, scope, markdown) {
  const db = load();
  const dir = path.join(paperDir(db, paperId), "Notes");
  fs.mkdirSync(dir, { recursive: true });
  const clean = sanitize(title) || "Formula sheet";
  let dest = path.join(dir, `${clean}.md`);
  let n = 1;
  while (fs.existsSync(dest)) dest = path.join(dir, `${clean} (${n++}).md`);
  fs.writeFileSync(dest, markdown, "utf8");
  const rec = {
    id: id(),
    paperId,
    title: (title || "").trim() || "Formula sheet",
    scope: scope || "everything",
    fileName: path.basename(dest),
    absPath: dest,
    createdAt: new Date().toISOString(),
  };
  db.formulaSheets.push(rec);
  save(db);
  return rec;
}

function removeFormulaSheet(sheetId) {
  const db = load();
  const rec = db.formulaSheets.find((f) => f.id === sheetId);
  if (!rec) return;
  try { fs.rmSync(rec.absPath, { force: true }); } catch {}
  db.formulaSheets = db.formulaSheets.filter((f) => f.id !== sheetId);
  save(db);
}

// ---- flashcard review state ------------------------------------------------

function getFlashState(summaryId) {
  const db = load();
  return db.flashcards[summaryId] || null;
}

function saveFlashState(summaryId, state) {
  const db = load();
  db.flashcards[summaryId] = state;
  save(db);
  return true;
}

// ---- per-document margin notes (shown beside a doc in the viewer) ----------

function getDocNote(docId) {
  const db = load();
  return db.docNotes[docId] || "";
}

function saveDocNote(docId, text) {
  const db = load();
  if (!text) delete db.docNotes[docId];
  else db.docNotes[docId] = text;
  save(db);
  return true;
}

function addSummary(docId, mode, markdown) {
  const db = load();
  const doc = db.docs.find((d) => d.id === docId);
  if (!doc) throw new Error("Doc not found");
  const ext = path.extname(doc.fileName);
  const base = path.basename(doc.fileName, ext);
  const dir = path.dirname(doc.absPath);
  let fileName = `${base} — ${mode}.md`;
  let dest = path.join(dir, sanitize(fileName));
  let n = 1;
  while (fs.existsSync(dest)) dest = path.join(dir, sanitize(`${base} — ${mode} (${n++}).md`));
  fs.writeFileSync(dest, markdown, "utf8");
  const summary = {
    id: id(),
    mode,
    fileName: path.basename(dest),
    absPath: dest,
    createdAt: new Date().toISOString(),
  };
  doc.summaries.push(summary);
  save(db);
  return summary;
}

function removeDoc(docId) {
  const db = load();
  const doc = db.docs.find((d) => d.id === docId);
  if (!doc) return;
  try { fs.rmSync(doc.absPath, { force: true }); } catch {}
  if (doc.textPath) try { fs.rmSync(doc.textPath, { force: true }); } catch {}
  for (const s of doc.summaries) {
    try { fs.rmSync(s.absPath, { force: true }); } catch {}
    delete db.flashcards[s.id];
  }
  db.docs = db.docs.filter((d) => d.id !== docId);
  for (const t of db.tests) t.docIds = t.docIds.filter((x) => x !== docId);
  save(db);
}

// ---- tests --------------------------------------------------------------

function testsDir(db, semId, testName) {
  return path.join(semesterDir(db, semId), "_Tests", sanitize(testName));
}

function createTest(semesterId, name, docIds, pastPaperDocId, paperId, dueDate) {
  const db = load();
  const t = {
    id: id(),
    semesterId,
    paperId: paperId || null, // tests cover a single paper
    name: name.trim(),
    docIds: docIds || [],
    pastPaperDocId: pastPaperDocId || null,
    dueDate: dueDate || null,
    materialPath: null,
    createdAt: new Date().toISOString(),
  };
  db.tests.push(t);
  save(db);
  fs.mkdirSync(testsDir(db, semesterId, t.name), { recursive: true });
  return t;
}

function setTestMaterial(testId, markdown) {
  const db = load();
  const t = db.tests.find((x) => x.id === testId);
  if (!t) throw new Error("Test not found");
  const dir = testsDir(db, t.semesterId, t.name);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "Study Material.md");
  fs.writeFileSync(dest, markdown, "utf8");
  t.materialPath = dest;
  save(db);
  return t;
}

// Edit a test's name / sources / past paper / due date (add material later).
function updateTest(testId, patch) {
  const db = load();
  const t = db.tests.find((x) => x.id === testId);
  if (!t) throw new Error("Test not found");
  if ("name" in patch && patch.name?.trim()) t.name = patch.name.trim();
  if ("docIds" in patch) t.docIds = patch.docIds || [];
  if ("pastPaperDocId" in patch) t.pastPaperDocId = patch.pastPaperDocId || null;
  if ("dueDate" in patch) t.dueDate = patch.dueDate || null;
  save(db);
  return t;
}

function setTestDueDate(testId, dueDate) {
  const db = load();
  const t = db.tests.find((x) => x.id === testId);
  if (!t) throw new Error("Test not found");
  t.dueDate = dueDate || null;
  save(db);
  return t;
}

function removeTest(testId) {
  const db = load();
  const t = db.tests.find((x) => x.id === testId);
  if (!t) return;
  try { fs.rmSync(testsDir(db, t.semesterId, t.name), { recursive: true, force: true }); } catch {}
  db.tests = db.tests.filter((x) => x.id !== testId);
  save(db);
}

// ---- scope helpers ------------------------------------------------------

// scope: {kind:"paper"|"semester"|"year"|"all", id}
function docsInScope(db, scope) {
  if (!scope || scope.kind === "all") return db.docs;
  if (scope.kind === "paper") return db.docs.filter((d) => d.paperId === scope.id);
  if (scope.kind === "semester") {
    const hit = findSemester(db, scope.id);
    if (!hit) return [];
    const ids = hit.sem.papers.map((p) => p.id);
    return db.docs.filter((d) => ids.includes(d.paperId));
  }
  if (scope.kind === "year") {
    const y = findYear(db, scope.id);
    if (!y) return [];
    const ids = y.semesters.flatMap((s) => s.papers.map((p) => p.id));
    return db.docs.filter((d) => ids.includes(d.paperId));
  }
  return [];
}

module.exports = {
  CATEGORIES,
  DAYS,
  allCategories,
  addCategory,
  getTimetable,
  getTimetableData,
  saveTimetable,
  setTimetableMeta,
  setTimetableFull,
  addTimetableEntry,
  updateTimetableEntry,
  removeTimetableEntry,
  dayIndexOf,
  libRoot,
  dbPath,
  ensureRoot,
  load,
  save,
  addYear,
  addSemester,
  addPaper,
  removeNode,
  registerDoc,
  setDocCategory,
  addAssignment,
  removeAssignment,
  addTodo,
  toggleTodo,
  updateTodo,
  removeTodo,
  addEvent,
  removeEvent,
  addPublicHolidays,
  buildTimetableICS,
  buildAssessmentsICS,
  addSummary,
  removeDoc,
  createNote,
  updateNote,
  setDocMeta,
  getSidenote,
  saveSidenote,
  sidenotePath,
  listFormulaSheets,
  addFormulaSheet,
  removeFormulaSheet,
  getFlashState,
  saveFlashState,
  getDocNote,
  saveDocNote,
  createTest,
  updateTest,
  setTestMaterial,
  setTestDueDate,
  removeTest,
  docsInScope,
  findPaper,
  findSemester,
};
