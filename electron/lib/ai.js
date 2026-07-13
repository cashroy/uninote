const path = require("path");
const claude = require("./claude");
const library = require("./library");
const indexer = require("./indexer");
const graphify = require("./graphify");
const store = require("./store");

const SUMMARY_MODES = {
  "study-sheet": {
    label: "Study sheet",
    instruction:
      "Create a study sheet: outline ALL the key points, definitions, formulas and concepts in a compact, scannable format a student can revise from. Use headings, bullet points and tables where helpful.",
  },
  outline: {
    label: "Structured outline",
    instruction:
      "Create a hierarchical outline of the document: main topics, subtopics and the essential detail under each. Preserve the document's own structure and ordering.",
  },
  flashcards: {
    label: "Flashcards (Q&A)",
    instruction:
      "Create revision flashcards covering the important material. Format each as '**Q:** ...' followed by '**A:** ...'. Aim for thorough coverage, from basic recall to applied understanding.",
  },
  eli5: {
    label: "Plain-language explainer",
    instruction:
      "Explain the content of this document in plain, simple language, as if teaching a smart friend who has never seen the topic. Use analogies and worked examples where they help.",
  },
  "exam-prep": {
    label: "Exam revision summary",
    instruction:
      "Create an exam-focused revision summary: the concepts most likely to be examined, common pitfalls, worked examples of the key problem types, and a final quick-reference checklist.",
  },
};

function truncate(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n\n[...document truncated...]" : text;
}

// Pull the first balanced JSON value (array or object) out of a model response,
// tolerating markdown fences and surrounding prose. More reliable than a greedy
// regex, which can over-match trailing text that happens to contain a bracket.
function extractJson(raw, open, close) {
  if (!raw) return null;
  const s = String(raw).replace(/```(?:json)?/gi, "");
  const start = s.indexOf(open);
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

// Normalise assorted time strings ("9am", "1:30 PM", "0900", "9.00") to "HH:MM".
function normTime(t) {
  if (t == null) return "";
  const s = String(t).trim();
  if (!s) return "";
  let m = s.match(/^(\d{1,2})[:.\s]?(\d{2})\s*([ap]\.?m\.?)?$/i);
  if (m) {
    let h = +m[1];
    const min = m[2];
    const ap = (m[3] || "").toLowerCase();
    if (ap.startsWith("p") && h < 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
    if (h > 23) return s;
    return `${String(h).padStart(2, "0")}:${min}`;
  }
  m = s.match(/^(\d{1,2})\s*([ap]\.?m\.?)$/i); // "9am", "1 pm"
  if (m) {
    let h = +m[1];
    const ap = m[2].toLowerCase();
    if (ap.startsWith("p") && h < 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }
  return s;
}

// ---- classification -------------------------------------------------------

async function classify(fileName, text) {
  // "Notes" is reserved for notes created inside the app; "Other" is a fallback
  const all = library.allCategories();
  const categories = all.filter((c) => c !== "Other" && c !== "Notes");
  const prompt = `You are organising a university student's course documents into folders.

Classify the document below into exactly ONE of these categories:
${categories.map((c) => `- ${c}`).join("\n")}
- Other (only if nothing else fits)

Filename: ${fileName}

Document content (may be truncated or empty for scanned/image files):
"""
${truncate(text, 6000)}
"""

Respond with ONLY a JSON object on one line, no other text:
{"category": "<one of the categories exactly as written>", "reason": "<short reason>"}`;

  const raw = await claude.complete({ prompt, maxTokens: 300 });
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    if (all.includes(parsed.category)) {
      return { category: parsed.category, reason: parsed.reason || "" };
    }
  } catch {}
  // tolerant fallback: look for a category name anywhere in the response
  const hit = all.find((c) => raw.toLowerCase().includes(c.toLowerCase()));
  return { category: hit || "Other", reason: "" };
}

// ---- timetable parsing ----------------------------------------------------

async function parseTimetable(text) {
  const prompt = `Below is text extracted from a student's class timetable. It may be a grid (weekdays across the top as columns, times down the side as rows), a list, or messy exported text where the layout is lost. Extract every scheduled class into structured data.

Reading rules:
- If it's a grid, a class belongs to the WEEKDAY of its column and the TIME of its row. Read carefully so classes land on the right day.
- Convert every time to 24-hour "HH:MM" (e.g. "1pm" → "13:00", "9.30am" → "09:30").
- Map day names/abbreviations to the full weekday ("Mon"/"M" → "Monday").
- One object per class occurrence. If the same class runs at several times, output one object each.
- Ignore headers, week numbers, room legends and blank cells — only real classes.

For each class produce: day (full weekday name), start ("HH:MM"), end ("HH:MM"), title (course/paper name or code), location (room/building if present, else ""), type (e.g. Lecture, Lab, Tutorial, Workshop — else "").

Timetable text:
"""
${truncate(text, 40000)}
"""

Respond with ONLY a JSON array, no prose, no code fences, like:
[{"day":"Monday","start":"09:00","end":"10:00","title":"STAT201","location":"Room 4","type":"Lecture"}]
If you cannot find any classes, respond with [].`;

  // "sonnet" keeps this structured extraction accurate but much faster than opus.
  const raw = await claude.complete({ prompt, maxTokens: 4000, model: "sonnet", thinking: false });
  try {
    const jsonText = extractJson(raw, "[", "]");
    const arr = JSON.parse(jsonText ?? raw);
    if (Array.isArray(arr)) {
      return arr
        .filter((e) => e && e.title)
        .map((e) => ({
          day: e.day || "Monday",
          dayIndex: library.dayIndexOf(e.day),
          start: normTime(e.start),
          end: normTime(e.end),
          title: String(e.title).trim(),
          location: e.location || "",
          type: e.type || "",
        }));
    }
  } catch {}
  return [];
}

// Natural-language editing of the whole timetable (classes + term dates + breaks).
async function assistTimetable(current, instruction, university) {
  const prompt = `You manage a university student's weekly class timetable and semester schedule.

Current timetable JSON:
"""
${JSON.stringify(current, null, 2)}
"""
${university ? `The student studies at: ${university}\n` : ""}
The student's request: "${instruction}"

Update the timetable to satisfy the request and return the COMPLETE new state. Rules:
- entries: recurring weekly classes, each {day (full weekday name), start ("HH:MM" 24h), end ("HH:MM"), title, location, type}.
- termStart / termEnd: ISO "YYYY-MM-DD" dates bounding the current semester, so the timetable stops repeating after the semester ends. Use null if genuinely unknown.
- breaks: array of {start, end, label} ISO date ranges when there are no classes (e.g. mid-semester break).
- Keep everything the student did NOT ask to change exactly as-is.
- To add breaks between classes (lunch etc.), add normal entries with title "Break" or "Lunch".
- If asked for a named university's semester or break dates and you can look them up, do so; otherwise give your best estimate and say it's an estimate in "note".

Respond with ONLY a JSON object, no other text:
{"entries":[...],"termStart":"YYYY-MM-DD" or null,"termEnd":"YYYY-MM-DD" or null,"breaks":[{"start":"YYYY-MM-DD","end":"YYYY-MM-DD","label":"..."}],"note":"one short sentence for the student"}`;

  const raw = await claude.complete({ prompt, maxTokens: 8000 });
  const jsonText = extractJson(raw, "{", "}");
  if (!jsonText) throw new Error("Claude didn't return a usable timetable.");
  const obj = JSON.parse(jsonText);
  return {
    entries: Array.isArray(obj.entries) ? obj.entries : current.entries,
    termStart: obj.termStart || null,
    termEnd: obj.termEnd || null,
    breaks: Array.isArray(obj.breaks) ? obj.breaks : [],
    note: obj.note || "Timetable updated.",
  };
}

// ---- summarisation --------------------------------------------------------

async function summarize(doc, mode, customInstruction, onDelta) {
  const modeDef = SUMMARY_MODES[mode];
  const instruction = customInstruction?.trim() || modeDef?.instruction;
  if (!instruction) throw new Error("Unknown summary mode: " + mode);

  const text = indexer.readDocText(doc);
  const isPdf = path.extname(doc.fileName).toLowerCase() === ".pdf";
  const usePdfNative =
    store.getSettings().backend === "api" && isPdf && text.trim().length < 200;

  const prompt = `${instruction}

The document is "${doc.fileName}" (categorised as ${doc.category}) from a university course.
Write the result as clean Markdown with a title. Do not add commentary about the task itself.
${usePdfNative ? "" : `\nDocument content:\n"""\n${truncate(text, 120000)}\n"""`}`;

  const md = await claude.complete({
    system: "You are an expert academic tutor creating high-quality study materials.",
    prompt,
    maxTokens: 32000,
    onDelta,
    pdfPath: usePdfNative ? doc.absPath : undefined,
  });
  return md;
}

// ---- test / study material ------------------------------------------------

async function generateTestMaterial(test, docs, pastPaperDoc, onDelta) {
  const parts = docs.map(
    (d) =>
      `### Source: ${d.fileName} (${d.category})\n"""\n${truncate(indexer.readDocText(d), 30000)}\n"""`
  );
  let pastPaperBlock = "";
  if (pastPaperDoc) {
    pastPaperBlock = `\n\nA past paper for this test is included. Analyse its style and question types, and make the practice questions match it:\n### Past paper: ${pastPaperDoc.fileName}\n"""\n${truncate(indexer.readDocText(pastPaperDoc), 30000)}\n"""`;
  }

  const prompt = `A student has an upcoming test called "${test.name}". Below is all the material the test covers.

Create complete study material for it as clean Markdown, containing:
1. **Topic map** — everything examinable, grouped by theme.
2. **Condensed study notes** — key concepts, definitions and formulas per topic.
3. **Practice questions** — a realistic set with a marked answer section at the end.
4. **Revision checklist** — what to be able to do before the test.
${pastPaperBlock}

Covered material:
${parts.join("\n\n")}`;

  return claude.complete({
    system: "You are an expert academic tutor preparing a student for a test.",
    prompt,
    maxTokens: 48000,
    onDelta,
  });
}

// ---- formula sheet --------------------------------------------------------

// What each formula-sheet scope should include.
const FORMULA_SCOPES = {
  everything: "every formula, equation, identity, key definition, rule, theorem, constant and important result",
  formulas: "every formula, equation and identity — mathematical expressions only, not prose definitions",
  definitions: "every key definition, term and concept, each with its precise meaning",
  formulas_definitions: "every formula and equation, plus every key definition and term",
  results: "every key result, theorem, law and property, noting the conditions under which each holds",
};

// Reads every document in a paper and builds one scoped formula sheet.
async function generateFormulaSheet(paper, docs, scope, custom, onDelta) {
  const parts = docs.map(
    (d) => `### ${d.fileName} (${d.category})\n"""\n${truncate(indexer.readDocText(d), 24000)}\n"""`
  );
  const title = `${paper.code}${paper.name ? " " + paper.name : ""}`;
  const what = scope === "custom" && custom?.trim() ? custom.trim() : (FORMULA_SCOPES[scope] || FORMULA_SCOPES.everything);
  const prompt = `Build a FORMULA SHEET for the university paper "${title}", pulling together material from the documents below.

Include ${what}. Organise it by topic with clear Markdown headings. Show each item clearly (use LaTeX-style notation where it helps), define what any symbols mean, and add a short note on when or how to use it. Be exhaustive but compact — this is a one-stop revision reference, not prose. No narrative introduction or conclusion.

Course material:
${parts.join("\n\n") || "(No readable text was extracted — infer the standard content a course with this code/name would cover, and say so at the top.)"}`;

  return claude.complete({
    system: "You are an expert academic tutor assembling a rigorous, exhaustive exam formula sheet in clean Markdown.",
    prompt,
    maxTokens: 32000,
    onDelta,
  });
}

// ---- chat -----------------------------------------------------------------

// Papers within a chat scope, so the assistant can target where a note goes.
function papersInScope(db, scope) {
  const out = [];
  const push = (y, s, p) => out.push({ id: p.id, code: p.code, name: p.name || "" });
  if (!scope || scope.kind === "all") {
    for (const y of db.years) for (const s of y.semesters) for (const p of s.papers) push(y, s, p);
  } else if (scope.kind === "paper") {
    const hit = library.findPaper(db, scope.id);
    if (hit) push(hit.year, hit.sem, hit.paper);
  } else if (scope.kind === "semester") {
    const hit = library.findSemester(db, scope.id);
    if (hit) for (const p of hit.sem.papers) push(hit.year, hit.sem, p);
  } else if (scope.kind === "year") {
    const y = db.years.find((x) => x.id === scope.id);
    if (y) for (const s of y.semesters) for (const p of s.papers) push(y, s, p);
  }
  return out;
}

// Execute an action the assistant asked for. Only touches the student's own data
// and only edits notes made in-app (never uploaded documents).
async function executeAction(act, scope, db) {
  const university = store.getSettings().university || "";
  if (act.action === "timetable") {
    const result = await assistTimetable(library.getTimetableData(), String(act.instruction || ""), university);
    library.setTimetableFull(result);
    return { changed: true, note: `Calendar updated — ${result.note || "done"}.` };
  }
  if (act.action === "create_note") {
    const paperId = act.paperId || (scope?.kind === "paper" ? scope.id : null);
    if (!paperId || !library.findPaper(db, paperId)) {
      return { changed: false, note: "Tell me which paper to put the note in and I'll create it." };
    }
    const note = library.createNote(paperId, String(act.title || "Note").trim(), act.content || "");
    return { changed: true, note: `Created note “${note.fileName}”.` };
  }
  if (act.action === "edit_note") {
    const doc = db.docs.find((d) => d.id === act.docId && d.isNote);
    if (!doc) return { changed: false, note: "I can only edit notes created in UniNote, not uploaded files." };
    library.updateNote(act.docId, act.content || "");
    return { changed: true, note: `Updated note “${doc.fileName}”.` };
  }
  return { changed: false, note: "" };
}

async function chat(scope, question, history, onDelta) {
  const db = library.load();
  const docs = library.docsInScope(db, scope);
  const settings = store.getSettings();

  let contextBlock = "";
  let contextSource = "builtin";

  if (settings.indexMode === "graphify" && graphify.graphExists()) {
    try {
      const answer = await graphify.query(question);
      if (answer && answer.trim()) {
        contextBlock = `Knowledge-graph context (from graphify, built over the student's notes):\n"""\n${truncate(answer, 20000)}\n"""`;
        contextSource = "graphify";
      }
    } catch (err) {
      console.error("graphify query failed, falling back to built-in index:", err.message);
    }
  }

  if (!contextBlock) {
    const hits = indexer.search(docs, question, 6);
    if (hits.length) {
      contextBlock =
        "Relevant excerpts from the student's documents:\n" +
        hits
          .map((h) => `--- From "${h.fileName}" (${h.category}) ---\n${h.excerpt}`)
          .join("\n\n");
    }
  }

  const fileList = docs
    .slice(0, 100)
    .map((d) => `- ${d.fileName} [${d.category}]`)
    .join("\n");

  const editableNotes = docs
    .filter((d) => d.isNote)
    .slice(0, 60)
    .map((d) => `  - id:${d.id} · "${d.fileName}"`)
    .join("\n");
  const paperTargets = papersInScope(db, scope)
    .slice(0, 60)
    .map((p) => `  - id:${p.id} · ${p.code}${p.name ? ` (${p.name})` : ""}`)
    .join("\n");
  const timetable = library.getTimetableData();

  const historyBlock = (history || [])
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.text}`)
    .join("\n");

  const prompt = `${contextBlock ? contextBlock + "\n\n" : ""}Documents in the student's current location:
${fileList || "(none yet)"}

Notes you may edit (id → title):
${editableNotes || "(none)"}

Papers you may add a note to (id → code):
${paperTargets || "(none)"}

Current timetable / calendar JSON:
${JSON.stringify(timetable)}

${historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : ""}Student's question: ${question}`;

  const system = `You are a study assistant embedded in UniNote, the student's notes organiser. Answer questions using the provided document context, and say so when the notes don't cover something. Be concrete and cite which document information came from. Use Markdown.

You can also make changes for the student. When they ask you to change their timetable/calendar, or to create or edit a note, do it by ENDING your reply with exactly ONE fenced code block labelled action containing a JSON object. Write your normal, friendly reply first; never mention the JSON block.

Actions:
- Edit the calendar/timetable: {"action":"timetable","instruction":"<plain-English change, e.g. add a STAT201 lecture Monday 9-10 in Room 4, move the lab to Thursday, or set the semester end to 14 June>"}
- Create a note (new material): {"action":"create_note","paperId":"<id from the papers list>","title":"<title>","content":"<full note as Markdown>"}
- Edit an existing note: {"action":"edit_note","docId":"<id from the editable-notes list>","content":"<the complete new Markdown>"}

Rules: only ever edit notes listed above (never uploaded documents). When writing note content, output the whole document, not a diff. If the target paper is ambiguous, ask instead of guessing. Only include an action block when the student actually asked you to change something.`;

  const raw = await claude.complete({ system, prompt, maxTokens: 8000, onDelta });

  let text = raw;
  let changed = false;
  const m = raw.match(/```action\s*([\s\S]*?)```/i);
  if (m) {
    text = raw.replace(m[0], "").trim();
    try {
      const act = JSON.parse(extractJson(m[1], "{", "}") ?? m[1]);
      const r = await executeAction(act, scope, db);
      changed = r.changed;
      if (r.note) text += `\n\n*${r.note}*`;
    } catch (e) {
      text += `\n\n*Sorry — I couldn't apply that change (${e.message}).*`;
    }
  }
  return { text, contextSource, changed };
}

module.exports = { classify, summarize, generateTestMaterial, generateFormulaSheet, chat, parseTimetable, assistTimetable, SUMMARY_MODES };
