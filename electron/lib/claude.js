const { spawn, execFile } = require("child_process");
const fs = require("fs");
const store = require("./store");

// ---------------------------------------------------------------------------
// Two interchangeable backends:
//   "api"         — @anthropic-ai/sdk with the user's API key (supports
//                   streaming and native PDF input)
//   "claude-code" — drives the locally installed Claude Code CLI headlessly,
//                   billed against the user's Claude subscription
// ---------------------------------------------------------------------------

function getClient() {
  const Anthropic = require("@anthropic-ai/sdk");
  const key = store.getApiKey();
  if (!key) throw new Error("No API key configured. Open Settings to add one.");
  return new Anthropic({ apiKey: key });
}

function checkClaudeCode() {
  return new Promise((resolve) => {
    execFile("claude", ["--version"], { shell: true, timeout: 15000 }, (err, stdout) => {
      if (err) resolve({ available: false });
      else resolve({ available: true, version: String(stdout).trim() });
    });
  });
}

async function testApiKey(key) {
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });
    await client.models.retrieve("claude-haiku-4-5"); // free, validates auth
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// Opens a terminal running `claude`, which triggers its browser login flow.
function loginClaudeCode() {
  return new Promise((resolve) => {
    try {
      if (process.platform === "win32") {
        // /k keeps the window open so the user can complete the OAuth prompt
        spawn("cmd.exe", ["/c", "start", "cmd", "/k", "claude"], {
          shell: false,
          detached: true,
          windowsHide: false,
        });
      } else if (process.platform === "darwin") {
        spawn("osascript", ["-e", 'tell app "Terminal" to do script "claude"']);
      } else {
        spawn("x-terminal-emulator", ["-e", "claude"], { detached: true });
      }
      resolve({ ok: true });
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

// Confirms Claude Code is installed AND logged in by running a trivial prompt.
async function testClaudeCode() {
  try {
    const out = await runClaudeCode("Reply with exactly: OK", { timeoutMs: 60000 });
    if (/ok/i.test(out)) return { ok: true };
    return { ok: false, error: "Unexpected response — you may need to log in." };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// Short aliases the Claude Code CLI understands, and their full API model ids.
const MODEL_IDS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-4-8",
};

// Run Claude Code headlessly. Prompt goes via stdin so no shell-quoting issues.
function runClaudeCode(prompt, { timeoutMs = 300000, cwd, extraArgs = [], model } = {}) {
  return new Promise((resolve, reject) => {
    // A lighter model (e.g. "sonnet") makes structured extraction like timetable
    // parsing far faster than the default (opus) without hurting accuracy.
    const modelArgs = model ? ["--model", model] : [];
    const args = ["-p", "--output-format", "json", ...modelArgs, ...extraArgs];
    const child = spawn("claude", args, {
      shell: true,
      cwd: cwd || undefined,
      env: process.env,
      windowsHide: true,
    });
    let out = "";
    let errOut = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude Code timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (errOut += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error("Could not launch Claude Code: " + e.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        return reject(new Error("Claude Code failed: " + (errOut || `exit ${code}`)));
      }
      try {
        const parsed = JSON.parse(out);
        resolve(parsed.result ?? parsed.content ?? String(out));
      } catch {
        resolve(out.trim());
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Unified completion.
 * opts: { system, prompt, maxTokens, onDelta, pdfPath, model, thinking }
 *  - onDelta streams text chunks (API backend only; claude-code delivers one chunk)
 *  - pdfPath attaches a PDF as a native document block (API backend only)
 *  - model overrides the model for this call (e.g. "sonnet" for fast parsing)
 *  - thinking=false disables extended thinking (faster for structured extraction)
 * Returns the full text.
 */
// ---- Gemini (Google AI Studio) --------------------------------------------
// REST call so we don't take on another SDK dependency. Non-streaming; onDelta
// is fired once with the full text (the UI handles single-chunk delivery).
async function geminiComplete({ system, prompt, maxTokens, onDelta, pdfPath, model }) {
  const key = store.getGeminiKey();
  if (!key) throw new Error("No Gemini API key configured. Open Settings to add one.");
  const settings = store.getSettings();
  const m = model && String(model).startsWith("gemini") ? model : settings.geminiModel || "gemini-2.5-flash";
  const parts = [];
  if (pdfPath) {
    parts.push({ inlineData: { mimeType: "application/pdf", data: fs.readFileSync(pdfPath).toString("base64") } });
  }
  parts.push({ text: prompt });
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    let detail = await res.text();
    try { detail = JSON.parse(detail).error?.message || detail; } catch {}
    throw new Error("Gemini request failed: " + String(detail).slice(0, 300));
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (onDelta) onDelta(text);
  return text;
}

async function testGeminiKey(key) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with OK" }] }] }),
      }
    );
    if (res.ok) return { ok: true };
    let detail = await res.text();
    try { detail = JSON.parse(detail).error?.message || detail; } catch {}
    return { ok: false, error: String(detail).slice(0, 300) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function complete({ system, prompt, maxTokens = 16000, onDelta, pdfPath, model, thinking = true }) {
  const settings = store.getSettings();

  if (settings.backend === "gemini") {
    return geminiComplete({ system, prompt, maxTokens, onDelta, pdfPath, model });
  }

  // API backend retained but only used if explicitly configured; the app now
  // ships login-only, so this branch is normally never taken.
  if (settings.backend === "api" && store.getApiKey()) {
    const client = getClient();
    const content = [];
    if (pdfPath) {
      const b64 = fs.readFileSync(pdfPath).toString("base64");
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: b64 },
      });
    }
    content.push({ type: "text", text: prompt });

    const stream = client.messages.stream({
      model: MODEL_IDS[model] || model || settings.model || "claude-opus-4-8",
      max_tokens: maxTokens,
      system: system || undefined,
      ...(thinking ? { thinking: { type: "adaptive" } } : {}),
      messages: [{ role: "user", content }],
    });
    if (onDelta) stream.on("text", (t) => onDelta(t));
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      throw new Error("Claude declined this request.");
    }
    return final.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  // claude-code backend — single-shot, prompt carries the system text
  const full = (system ? `<instructions>\n${system}\n</instructions>\n\n` : "") + prompt;
  const text = await runClaudeCode(full, { model });
  if (onDelta) onDelta(text);
  return text;
}

module.exports = {
  complete,
  checkClaudeCode,
  testApiKey,
  testGeminiKey,
  testClaudeCode,
  loginClaudeCode,
  runClaudeCode,
};
