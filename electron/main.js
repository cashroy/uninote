const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");

const store = require("./lib/store");
const library = require("./lib/library");
const { extractText, renderRich } = require("./lib/extract");
const claude = require("./lib/claude");
const ai = require("./lib/ai");
const graphify = require("./lib/graphify");
const search = require("./lib/search");
const updater = require("./lib/updater");

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#ffffff",
    title: "UniNote",
    frame: false, // custom seamless titlebar drawn in the renderer
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  if (process.env.UNINOTE_SMOKE) {
    win.webContents.on("did-finish-load", () => {
      console.log("SMOKE_OK: renderer loaded");
      setTimeout(() => app.quit(), 1500);
    });
    win.webContents.on("did-fail-load", (_e, code, desc) => {
      console.error("SMOKE_FAIL:", code, desc);
      app.exit(1);
    });
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

app.whenReady().then(() => {
  library.ensureRoot();
  createWindow();
  updater.init(send);
  // quietly check for updates a few seconds after launch (installed build only)
  if (updater.canUpdate() && !process.env.UNINOTE_SMOKE) {
    setTimeout(() => updater.check(), 4000);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- window controls (frameless) ---------------------------------------------

ipcMain.on("win:minimize", () => win && win.minimize());
ipcMain.on("win:toggleMaximize", () => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on("win:close", () => win && win.close());

// ---- auto-update -------------------------------------------------------------

ipcMain.handle("update:check", () => updater.check());
ipcMain.handle("update:download", () => updater.download());
ipcMain.handle("update:install", () => { updater.install(); });
ipcMain.handle("update:canUpdate", () => updater.canUpdate());

// ---- settings / setup -----------------------------------------------------

ipcMain.handle("settings:get", () => {
  const s = store.getSettings();
  return {
    onboarded: s.onboarded,
    backend: s.backend,
    model: s.model,
    geminiModel: s.geminiModel,
    indexMode: s.indexMode,
    theme: s.theme || "mono",
    university: s.university || "",
    universityCountry: s.universityCountry || "",
    dateFormat: s.dateFormat || "system",
    hasApiKey: !!store.getApiKey(),
    hasGeminiKey: !!store.getGeminiKey(),
    libraryPath: library.libRoot(),
    appVersion: app.getVersion(),
    canUpdate: updater.canUpdate(),
  };
});

ipcMain.handle("settings:save", (_e, patch) => {
  const { apiKey, geminiApiKey, ...rest } = patch || {};
  if (apiKey !== undefined) store.setApiKey(apiKey || null);
  if (geminiApiKey !== undefined) store.setGeminiKey(geminiApiKey || null);
  store.saveSettings(rest);
  return true;
});

ipcMain.handle("setup:checkClaudeCode", () => claude.checkClaudeCode());
ipcMain.handle("setup:testApiKey", (_e, key) => claude.testApiKey(key));
ipcMain.handle("setup:testGeminiKey", (_e, key) => claude.testGeminiKey(key));
ipcMain.handle("setup:loginClaude", () => claude.loginClaudeCode());
ipcMain.handle("setup:testClaude", () => claude.testClaudeCode());

// ---- library --------------------------------------------------------------

ipcMain.handle("lib:get", () => {
  const db = library.load();
  // allCategories() includes user-added custom categories, so documents filed
  // under a new category actually render in the paper view.
  return { ...db, categories: library.allCategories(db), libraryPath: library.libRoot() };
});

ipcMain.handle("lib:addYear", (_e, name) => library.addYear(name));
ipcMain.handle("lib:addSemester", (_e, yearId, name) => library.addSemester(yearId, name));
ipcMain.handle("lib:addPaper", (_e, semId, code, name) => library.addPaper(semId, code, name));
ipcMain.handle("lib:remove", (_e, kind, id) => library.removeNode(kind, id));
ipcMain.handle("lib:showInExplorer", () => shell.openPath(library.libRoot()));
ipcMain.handle("lib:categories", () => library.allCategories());
ipcMain.handle("lib:addCategory", (_e, name) => library.addCategory(name));

// ---- documents --------------------------------------------------------------

ipcMain.handle("dialog:pickFiles", async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Documents", extensions: ["pdf", "docx", "pptx", "xlsx", "txt", "md", "csv", "tex", "png", "jpg", "jpeg"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return res.canceled ? [] : res.filePaths;
});

// Extracted text is cached between analyze and commit so PDFs aren't parsed twice.
const pendingText = new Map();

// Phase 1: extract each file's text and ask Claude what type it looks like.
// Nothing is filed yet — the UI confirms the type with the user first.
ipcMain.handle("doc:analyze", async (_e, filePaths) => {
  const results = [];
  for (const fp of filePaths) {
    const name = path.basename(fp);
    send("ingest:update", { file: name, stage: "extracting" });
    let text = "";
    try {
      text = await extractText(fp);
    } catch {}
    pendingText.set(fp, text);
    send("ingest:update", { file: name, stage: "classifying" });
    let suggestion = "Other";
    let reason = "";
    try {
      const c = await ai.classify(name, text);
      suggestion = c.category;
      reason = c.reason;
    } catch (err) {
      send("ingest:update", { file: name, stage: "classify-failed", error: err.message });
    }
    send("ingest:update", { file: name, stage: "analyzed", suggestion, reason });
    results.push({ srcPath: fp, fileName: name, suggestion, reason });
  }
  return results;
});

// Phase 2: file a confirmed document into its (possibly user-chosen) category.
ipcMain.handle("doc:commit", async (_e, paperId, srcPath, category) => {
  let text = pendingText.get(srcPath);
  if (text === undefined) {
    try {
      text = await extractText(srcPath);
    } catch {
      text = "";
    }
  }
  const doc = library.registerDoc(paperId, srcPath, category, text);
  pendingText.delete(srcPath);
  return doc;
});

ipcMain.handle("doc:summarize", async (_e, docId, mode, customInstruction) => {
  const db = library.load();
  const doc = db.docs.find((d) => d.id === docId);
  if (!doc) throw new Error("Document not found");
  const md = await ai.summarize(doc, mode, customInstruction, (t) =>
    send("summarize:delta", { docId, text: t })
  );
  const label = ai.SUMMARY_MODES[mode]?.label || "Summary";
  const summary = library.addSummary(docId, label, md);
  return summary;
});

ipcMain.handle("doc:open", (_e, absPath) => shell.openPath(absPath));
ipcMain.handle("doc:readFile", (_e, absPath) => {
  const fs = require("fs");
  return fs.readFileSync(absPath, "utf8");
});

// Returns bytes (base64) + mime so the renderer can preview PDFs/images in-app
// via a blob URL, without exposing file:// access.
const MIME = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
ipcMain.handle("doc:readBytes", (_e, absPath) => {
  const fs = require("fs");
  const ext = path.extname(absPath).toLowerCase();
  return {
    mime: MIME[ext] || "application/octet-stream",
    base64: fs.readFileSync(absPath).toString("base64"),
    ext,
  };
});
ipcMain.handle("doc:delete", (_e, docId) => library.removeDoc(docId));

// Rich viewer rendering (docx -> HTML, pptx -> slides). PDFs/images/text are
// handled directly in the renderer via readBytes/readFile.
ipcMain.handle("doc:render", (_e, absPath) => renderRich(absPath));

// per-document margin notes shown beside a document in the viewer
ipcMain.handle("docnote:get", (_e, docId) => library.getDocNote(docId));
ipcMain.handle("docnote:save", (_e, docId, text) => library.saveDocNote(docId, text));

// ---- built-in notes & scratchpad ---------------------------------------------

ipcMain.handle("note:create", (_e, paperId, title, content) =>
  library.createNote(paperId, title, content || "")
);
ipcMain.handle("note:save", (_e, docId, content) => library.updateNote(docId, content));
ipcMain.handle("doc:setMeta", (_e, docId, patch) => library.setDocMeta(docId, patch));
ipcMain.handle("sidenote:get", (_e, paperId) => library.getSidenote(paperId));
ipcMain.handle("sidenote:save", (_e, paperId, content) =>
  library.saveSidenote(paperId, content)
);

// ---- timetable ----------------------------------------------------------------

ipcMain.handle("timetable:get", () => library.getTimetableData());
ipcMain.handle("timetable:save", (_e, entries) => library.saveTimetable(entries));
ipcMain.handle("timetable:setMeta", (_e, patch) => library.setTimetableMeta(patch));
ipcMain.handle("timetable:addEntry", (_e, entry) => library.addTimetableEntry(entry));
ipcMain.handle("timetable:updateEntry", (_e, entryId, patch) =>
  library.updateTimetableEntry(entryId, patch)
);
ipcMain.handle("timetable:removeEntry", (_e, entryId) => library.removeTimetableEntry(entryId));

// Natural-language edit: send the current timetable + instruction to Claude,
// apply the returned full state.
ipcMain.handle("timetable:assist", async (_e, instruction) => {
  try {
    const current = library.getTimetableData();
    const university = store.getSettings().university || "";
    const result = await ai.assistTimetable(current, instruction, university);
    const saved = library.setTimetableFull(result);
    return { ok: true, ...saved, note: result.note };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// Extract + parse an uploaded timetable file into structured entries (not saved).
ipcMain.handle("timetable:parseFile", async (_e, filePath) => {
  let text = "";
  try {
    text = await extractText(filePath);
  } catch {}
  if (!text.trim()) {
    return { ok: false, error: "Couldn't read any text from that file. Try a PDF, Excel, Word or text timetable." };
  }
  try {
    const entries = await ai.parseTimetable(text);
    return { ok: true, entries };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// ---- formula sheet (per-paper, AI generated) ----------------------------------

ipcMain.handle("formula:list", (_e, paperId) => library.listFormulaSheets(paperId));
ipcMain.handle("formula:remove", (_e, sheetId) => library.removeFormulaSheet(sheetId));

ipcMain.handle("formula:generate", async (_e, paperId, scope, custom, title) => {
  const db = library.load();
  const hit = library.findPaper(db, paperId);
  if (!hit) return { ok: false, error: "Paper not found." };
  const docs = db.docs.filter((d) => d.paperId === paperId);
  if (!docs.length) return { ok: false, error: "Add some material to this paper first, then the AI can build a formula sheet from it." };
  try {
    const md = await ai.generateFormulaSheet(hit.paper, docs, scope, custom, (t) =>
      send("formula:delta", { paperId, text: t })
    );
    const sheet = library.addFormulaSheet(paperId, title, scope, md);
    return { ok: true, sheet, content: md };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// ---- global search ------------------------------------------------------------

ipcMain.handle("search:global", (_e, query) => search.globalSearch(query));

// ---- flashcards -----------------------------------------------------------------

ipcMain.handle("flash:get", (_e, summaryId) => library.getFlashState(summaryId));
ipcMain.handle("flash:save", (_e, summaryId, state) =>
  library.saveFlashState(summaryId, state)
);

// ---- tests ------------------------------------------------------------------

ipcMain.handle(
  "test:create",
  async (_e, semesterId, name, docIds, pastPaperDocId, paperId, dueDate) => {
    return library.createTest(semesterId, name, docIds, pastPaperDocId, paperId, dueDate);
  }
);

ipcMain.handle("test:setDueDate", (_e, testId, dueDate) =>
  library.setTestDueDate(testId, dueDate)
);

ipcMain.handle("test:update", (_e, testId, patch) => library.updateTest(testId, patch));

ipcMain.handle("test:generate", async (_e, testId) => {
  const db = library.load();
  const test = db.tests.find((t) => t.id === testId);
  if (!test) throw new Error("Test not found");
  const docs = db.docs.filter((d) => test.docIds.includes(d.id));
  const pastPaper = test.pastPaperDocId
    ? db.docs.find((d) => d.id === test.pastPaperDocId)
    : null;
  const md = await ai.generateTestMaterial(test, docs, pastPaper, (t) =>
    send("test:delta", { testId, text: t })
  );
  return library.setTestMaterial(testId, md);
});

ipcMain.handle("test:delete", (_e, testId) => library.removeTest(testId));

// ---- chat -------------------------------------------------------------------

ipcMain.handle("chat:send", async (_e, reqId, scope, question, history) => {
  try {
    const { text, contextSource, changed } = await ai.chat(scope, question, history, (t) =>
      send("chat:delta", { reqId, text: t })
    );
    send("chat:done", { reqId, text, contextSource, changed });
    return { ok: true };
  } catch (err) {
    send("chat:error", { reqId, error: err.message || String(err) });
    return { ok: false, error: err.message };
  }
});

// ---- graphify ---------------------------------------------------------------

ipcMain.handle("graphify:status", async () => {
  const s = graphify.status();
  return { ...s, cliAvailable: await graphify.cliAvailable() };
});

let graphBuilding = false;
ipcMain.handle("graphify:build", async () => {
  if (graphBuilding) return { ok: false, error: "A graph build is already running." };
  graphBuilding = true;
  send("graphify:progress", { stage: "started" });
  try {
    const res = await graphify.build({
      onLine: () => send("graphify:progress", { stage: "working" }),
    });
    send("graphify:progress", { stage: "done", graphExists: res.graphExists });
    return res;
  } catch (err) {
    send("graphify:progress", { stage: "error", error: err.message });
    return { ok: false, error: err.message };
  } finally {
    graphBuilding = false;
  }
});
