const fs = require("fs");
const library = require("./library");

// Global search across the whole library: structure names, document/note
// filenames and content, summaries, per-paper scratchpads, and tests.
// Returns hits with enough location info for the renderer to navigate.

function readSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function snippetAround(text, q) {
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return "";
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + q.length + 120);
  return (
    (start > 0 ? "…" : "") +
    text.slice(start, end).replace(/\s+/g, " ").trim() +
    (end < text.length ? "…" : "")
  );
}

function globalSearch(query, limit = 40) {
  const q = String(query || "").toLowerCase().trim();
  if (q.length < 2) return [];
  const db = library.load();
  const results = [];

  // location lookup tables
  const paperLoc = {}; // paperId -> {yearId, yearName, semId, semName, code, name}
  const semLoc = {};
  for (const y of db.years) {
    for (const s of y.semesters) {
      semLoc[s.id] = { yearId: y.id, yearName: y.name, semId: s.id, semName: s.name };
      for (const p of s.papers) {
        paperLoc[p.id] = { ...semLoc[s.id], paperId: p.id, code: p.code, name: p.name };
      }
    }
  }
  const where = (paperId) => {
    const l = paperLoc[paperId];
    return l ? `${l.yearName} · ${l.semName} · ${l.code}` : "";
  };

  const push = (hit) => {
    if (results.length < limit) results.push(hit);
  };

  // structure: years / semesters / papers
  for (const y of db.years) {
    if (y.name.toLowerCase().includes(q))
      push({ type: "year", title: y.name, where: "", nav: { kind: "year", yearId: y.id } });
    for (const s of y.semesters) {
      if (s.name.toLowerCase().includes(q))
        push({
          type: "semester",
          title: s.name,
          where: y.name,
          nav: { kind: "semester", semId: s.id, yearId: y.id },
        });
      for (const p of s.papers) {
        if (`${p.code} ${p.name || ""}`.toLowerCase().includes(q))
          push({
            type: "paper",
            title: `${p.code}${p.name ? " — " + p.name : ""}`,
            where: `${y.name} · ${s.name}`,
            nav: { kind: "paper", paperId: p.id, semId: s.id, yearId: y.id },
          });
      }
    }
  }

  const navFor = (paperId) => {
    const l = paperLoc[paperId];
    return l
      ? { kind: "paper", paperId, semId: l.semId, yearId: l.yearId }
      : { kind: "all" };
  };

  // documents & created notes (filename + content), and their summaries
  for (const d of db.docs) {
    if (results.length >= limit) break;
    const nameHit = d.fileName.toLowerCase().includes(q);
    let snippet = "";
    if (!nameHit && d.textPath) snippet = snippetAround(readSafe(d.textPath), q);
    if (nameHit || snippet) {
      push({
        type: d.isNote ? "note" : "document",
        title: d.fileName,
        where: where(d.paperId),
        snippet,
        docId: d.id,
        nav: navFor(d.paperId),
      });
    }
    for (const s of d.summaries) {
      if (results.length >= limit) break;
      const sNameHit = s.fileName.toLowerCase().includes(q);
      const sSnippet = sNameHit ? "" : snippetAround(readSafe(s.absPath), q);
      if (sNameHit || sSnippet) {
        push({
          type: "summary",
          title: s.fileName,
          where: where(d.paperId),
          snippet: sSnippet,
          absPath: s.absPath,
          nav: navFor(d.paperId),
        });
      }
    }
  }

  // per-paper scratchpads
  for (const paperId of Object.keys(paperLoc)) {
    if (results.length >= limit) break;
    const content = library.getSidenote(paperId);
    if (content && content.toLowerCase().includes(q)) {
      push({
        type: "side notes",
        title: `Side notes — ${paperLoc[paperId].code}`,
        where: where(paperId),
        snippet: snippetAround(content, q),
        nav: navFor(paperId),
      });
    }
  }

  // tests (name + study material content)
  for (const t of db.tests) {
    if (results.length >= limit) break;
    const nameHit = t.name.toLowerCase().includes(q);
    const matSnippet =
      !nameHit && t.materialPath ? snippetAround(readSafe(t.materialPath), q) : "";
    if (nameHit || matSnippet) {
      const l = semLoc[t.semesterId];
      push({
        type: "test",
        title: t.name,
        where: l ? `${l.yearName} · ${l.semName}` : "",
        snippet: matSnippet,
        nav: l ? { kind: "semester", semId: l.semId, yearId: l.yearId } : { kind: "all" },
      });
    }
  }

  return results;
}

module.exports = { globalSearch };
