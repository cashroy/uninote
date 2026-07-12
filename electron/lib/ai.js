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
  const prompt = `Below is text extracted from a student's class timetable (it may be a grid, a list, or messy). Extract every scheduled class into structured data.

For each class produce: day (full weekday name, e.g. "Monday"), start (24-hour "HH:MM"), end (24-hour "HH:MM"), title (course/paper name or code), location (room/building if present, else ""), type (e.g. Lecture, Lab, Tutorial, Workshop — else "").

Timetable text:
"""
${truncate(text, 40000)}
"""

Respond with ONLY a JSON array, no other text, like:
[{"day":"Monday","start":"09:00","end":"10:00","title":"STAT201","location":"Room 4","type":"Lecture"}]
If you cannot find any classes, respond with [].`;

  const raw = await claude.complete({ prompt, maxTokens: 4000 });
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(m ? m[0] : raw);
    if (Array.isArray(arr)) {
      return arr
        .filter((e) => e && e.title)
        .map((e) => ({
          day: e.day || "Monday",
          dayIndex: library.dayIndexOf(e.day),
          start: e.start || "",
          end: e.end || "",
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
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude didn't return a usable timetable.");
  const obj = JSON.parse(m[0]);
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

// ---- chat -----------------------------------------------------------------

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

  const historyBlock = (history || [])
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.text}`)
    .join("\n");

  const prompt = `${contextBlock ? contextBlock + "\n\n" : ""}Documents in the student's current location:
${fileList || "(none yet)"}

${historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : ""}Student's question: ${question}`;

  const text = await claude.complete({
    system:
      "You are a study assistant embedded in UniNote, the student's notes organiser. Answer using the provided document context when relevant, and say so when the notes don't cover something. Be concrete and cite which document information came from. Use Markdown.",
    prompt,
    maxTokens: 8000,
    onDelta,
  });
  return { text, contextSource };
}

module.exports = { classify, summarize, generateTestMaterial, chat, parseTimetable, assistTimetable, SUMMARY_MODES };
