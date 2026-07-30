const { contextBridge, ipcRenderer, webUtils } = require("electron");

const on = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("uninote", {
  platform: process.platform,

  // account / library sync (GitHub-backed)
  syncStatus: () => ipcRenderer.invoke("sync:status"),
  syncConnect: (token) => ipcRenderer.invoke("sync:connect", token),
  syncPush: (opts) => ipcRenderer.invoke("sync:push", opts),
  syncPull: () => ipcRenderer.invoke("sync:pull"),
  syncDisconnect: () => ipcRenderer.invoke("sync:disconnect"),

  // settings / setup
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  checkClaudeCode: () => ipcRenderer.invoke("setup:checkClaudeCode"),
  testApiKey: (key) => ipcRenderer.invoke("setup:testApiKey", key),
  testGeminiKey: (key) => ipcRenderer.invoke("setup:testGeminiKey", key),
  loginClaude: () => ipcRenderer.invoke("setup:loginClaude"),
  testClaude: () => ipcRenderer.invoke("setup:testClaude"),

  // window controls (frameless)
  winMinimize: () => ipcRenderer.send("win:minimize"),
  winToggleMaximize: () => ipcRenderer.send("win:toggleMaximize"),
  winClose: () => ipcRenderer.send("win:close"),

  // auto-update
  updateCheck: () => ipcRenderer.invoke("update:check"),
  updateDownload: () => ipcRenderer.invoke("update:download"),
  updateInstall: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: on("update:status"),

  // library
  getLibrary: () => ipcRenderer.invoke("lib:get"),
  addYear: (name) => ipcRenderer.invoke("lib:addYear", name),
  addSemester: (yearId, name) => ipcRenderer.invoke("lib:addSemester", yearId, name),
  addPaper: (semId, code, name) => ipcRenderer.invoke("lib:addPaper", semId, code, name),
  removeNode: (kind, id) => ipcRenderer.invoke("lib:remove", kind, id),
  showInExplorer: () => ipcRenderer.invoke("lib:showInExplorer"),
  getCategories: () => ipcRenderer.invoke("lib:categories"),
  addCategory: (name) => ipcRenderer.invoke("lib:addCategory", name),

  // documents
  pickFiles: () => ipcRenderer.invoke("dialog:pickFiles"),
  analyzeFiles: (filePaths) => ipcRenderer.invoke("doc:analyze", filePaths),
  commitFile: (paperId, srcPath, category) =>
    ipcRenderer.invoke("doc:commit", paperId, srcPath, category),
  onIngestUpdate: on("ingest:update"),
  summarize: (docId, mode, custom) => ipcRenderer.invoke("doc:summarize", docId, mode, custom),
  onSummarizeDelta: on("summarize:delta"),
  openFile: (absPath) => ipcRenderer.invoke("doc:open", absPath),
  readFile: (absPath) => ipcRenderer.invoke("doc:readFile", absPath),
  readBytes: (absPath) => ipcRenderer.invoke("doc:readBytes", absPath),
  renderDoc: (absPath) => ipcRenderer.invoke("doc:render", absPath),
  deleteDoc: (docId) => ipcRenderer.invoke("doc:delete", docId),
  setDocCategory: (docId, category) => ipcRenderer.invoke("doc:setCategory", docId, category),
  getDocNote: (docId) => ipcRenderer.invoke("docnote:get", docId),
  saveDocNote: (docId, text) => ipcRenderer.invoke("docnote:save", docId, text),

  // drag & drop helper (File.path was removed in modern Electron)
  pathForFile: (file) => webUtils.getPathForFile(file),

  // built-in notes & scratchpad
  createNote: (paperId, title, content) =>
    ipcRenderer.invoke("note:create", paperId, title, content),
  saveNote: (docId, content) => ipcRenderer.invoke("note:save", docId, content),
  setDocMeta: (docId, patch) => ipcRenderer.invoke("doc:setMeta", docId, patch),
  getSidenote: (paperId) => ipcRenderer.invoke("sidenote:get", paperId),
  saveSidenote: (paperId, content) => ipcRenderer.invoke("sidenote:save", paperId, content),

  // formula sheets (multiple, scoped, per paper)
  listFormulaSheets: (paperId) => ipcRenderer.invoke("formula:list", paperId),
  generateFormulaSheet: (paperId, scope, custom, title) =>
    ipcRenderer.invoke("formula:generate", paperId, scope, custom, title),
  removeFormulaSheet: (sheetId) => ipcRenderer.invoke("formula:remove", sheetId),
  onFormulaDelta: on("formula:delta"),

  // timetable
  getTimetable: () => ipcRenderer.invoke("timetable:get"),
  saveTimetable: (entries) => ipcRenderer.invoke("timetable:save", entries),
  setTimetableMeta: (patch) => ipcRenderer.invoke("timetable:setMeta", patch),
  addTimetableEntry: (entry) => ipcRenderer.invoke("timetable:addEntry", entry),
  updateTimetableEntry: (entryId, patch) =>
    ipcRenderer.invoke("timetable:updateEntry", entryId, patch),
  removeTimetableEntry: (entryId) => ipcRenderer.invoke("timetable:removeEntry", entryId),
  parseTimetableFile: (filePath) => ipcRenderer.invoke("timetable:parseFile", filePath),
  assistTimetable: (instruction) => ipcRenderer.invoke("timetable:assist", instruction),

  // assignments / exams
  addAssignment: (semId, paperId, name, dueDate, kind) =>
    ipcRenderer.invoke("assignment:add", semId, paperId, name, dueDate, kind),
  removeAssignment: (assignmentId) => ipcRenderer.invoke("assignment:remove", assignmentId),

  // general todo list
  addTodo: (text, dueDate) => ipcRenderer.invoke("todo:add", text, dueDate),
  toggleTodo: (todoId) => ipcRenderer.invoke("todo:toggle", todoId),
  updateTodo: (todoId, patch) => ipcRenderer.invoke("todo:update", todoId, patch),
  removeTodo: (todoId) => ipcRenderer.invoke("todo:remove", todoId),

  // calendar events / holidays / export
  addEvent: (ev) => ipcRenderer.invoke("event:add", ev),
  removeEvent: (eventId) => ipcRenderer.invoke("event:remove", eventId),
  fillPublicHolidays: () => ipcRenderer.invoke("calendar:publicHolidays"),
  exportCalendar: (which) => ipcRenderer.invoke("calendar:export", which),
  testGithubToken: (token) => ipcRenderer.invoke("setup:testGithubToken", token),
  publishCalendars: () => ipcRenderer.invoke("calendar:publish"),

  // search
  globalSearch: (query) => ipcRenderer.invoke("search:global", query),

  // flashcards
  flashGet: (summaryId) => ipcRenderer.invoke("flash:get", summaryId),
  flashSave: (summaryId, state) => ipcRenderer.invoke("flash:save", summaryId, state),

  // tests
  createTest: (semesterId, name, docIds, pastPaperDocId, paperId, dueDate) =>
    ipcRenderer.invoke("test:create", semesterId, name, docIds, pastPaperDocId, paperId, dueDate),
  setTestDueDate: (testId, dueDate) => ipcRenderer.invoke("test:setDueDate", testId, dueDate),
  updateTest: (testId, patch) => ipcRenderer.invoke("test:update", testId, patch),
  generateTest: (testId) => ipcRenderer.invoke("test:generate", testId),
  deleteTest: (testId) => ipcRenderer.invoke("test:delete", testId),
  onTestDelta: on("test:delta"),

  // chat
  sendChat: (reqId, scope, question, history) =>
    ipcRenderer.invoke("chat:send", reqId, scope, question, history),
  onChatDelta: on("chat:delta"),
  onChatDone: on("chat:done"),
  onChatError: on("chat:error"),

  // graphify
  graphifyStatus: () => ipcRenderer.invoke("graphify:status"),
  graphifyBuild: () => ipcRenderer.invoke("graphify:build"),
  onGraphifyProgress: on("graphify:progress"),
});
