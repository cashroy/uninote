const store = require("./store");
const library = require("./library");

// Publishes the user's calendars to a private GitHub Gist using their own token,
// updating the same gist in place so subscribe URLs stay stable and live.

const API = "https://api.github.com";
const TT_FILE = "UniNote-Timetable.ics";
const AS_FILE = "UniNote-Assessments.ics";

async function ghFetch(path, opts = {}) {
  const token = store.getGithubToken();
  if (!token) throw new Error("No GitHub token configured. Add one in the Calendar first.");
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = await res.text();
    try { msg = JSON.parse(msg).message || msg; } catch {}
    throw new Error(`GitHub ${res.status}: ${String(msg).slice(0, 160)}`);
  }
  return res.json();
}

async function testToken(token) {
  try {
    const res = await fetch(API + "/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { ok: false, error: `GitHub ${res.status}` };
    const u = await res.json();
    return { ok: true, login: u.login };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// SHA-less raw URLs always resolve to the latest revision — ideal for subscribing.
function rawUrls(login, gistId) {
  const base = `https://gist.githubusercontent.com/${login}/${gistId}/raw`;
  return { timetable: `${base}/${TT_FILE}`, assessments: `${base}/${AS_FILE}` };
}

async function publish() {
  const files = {
    [TT_FILE]: { content: library.buildTimetableICS() },
    [AS_FILE]: { content: library.buildAssessmentsICS() },
  };
  const s = store.getSettings();
  let gistId = s.gistId;
  let gist;
  if (gistId) {
    try {
      gist = await ghFetch(`/gists/${gistId}`, { method: "PATCH", body: JSON.stringify({ files }) });
    } catch {
      gistId = null; // gist deleted or inaccessible — recreate below
    }
  }
  if (!gistId) {
    gist = await ghFetch(`/gists`, {
      method: "POST",
      body: JSON.stringify({ description: "UniNote calendars (timetable + tests/assignments)", public: false, files }),
    });
    gistId = gist.id;
  }
  const login = (gist.owner && gist.owner.login) || s.gistOwner || "";
  store.saveSettings({ gistId, gistOwner: login });
  return { ok: true, gistId, login, ...rawUrls(login, gistId) };
}

module.exports = { publish, testToken, rawUrls };
