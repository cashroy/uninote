const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const library = require("./library");

// Integration with the user's graphify knowledge-graph tooling.
// - Queries hit the graphify CLI directly (cheap: graph traversal, no LLM).
// - Building/updating the graph is orchestrated through Claude Code headless
//   (`claude -p "/graphify ..."`), since the graphify skill drives extraction.

function graphDir() {
  return path.join(library.libRoot(), "graphify-out");
}

function graphExists() {
  return fs.existsSync(path.join(graphDir(), "graph.json"));
}

function cliAvailable() {
  return new Promise((resolve) => {
    execFile("graphify", ["--help"], { shell: true, timeout: 15000 }, (err) => {
      resolve(!err);
    });
  });
}

function status() {
  return {
    graphExists: graphExists(),
    graphDir: graphDir(),
  };
}

function query(question, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      "graphify",
      ["query", JSON.stringify(question)],
      { shell: true, cwd: library.libRoot(), timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(String(stdout).trim());
      }
    );
  });
}

// Rebuild/update the graph over the whole library via Claude Code headless.
// Long-running; progress is reported through the onLine callback.
function build({ onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--output-format", "json", "--permission-mode", "bypassPermissions"],
      { shell: true, cwd: library.libRoot(), windowsHide: true, env: process.env }
    );
    let out = "";
    let errOut = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Graph build timed out (30 min)"));
    }, 30 * 60 * 1000);
    child.stdout.on("data", (d) => {
      out += d;
      if (onLine) onLine(String(d));
    });
    child.stderr.on("data", (d) => (errOut += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error("Could not launch Claude Code: " + e.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!graphExists() && code !== 0) {
        return reject(new Error("Graph build failed: " + (errOut || `exit ${code}`)));
      }
      resolve({ ok: true, graphExists: graphExists() });
    });
    child.stdin.write(
      graphExists()
        ? "/graphify . --update --no-viz"
        : "/graphify . --no-viz"
    );
    child.stdin.end();
  });
}

module.exports = { status, graphExists, cliAvailable, query, build, graphDir };
