const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const library = require("./library");

// Account = the user's GitHub account (via a personal access token). The whole
// library — library.json plus every file under the library folder — is synced to
// a private repo using the Git Data API, so a back-up is a single commit no matter
// how many files there are, and unchanged files are never re-uploaded (Git is
// content-addressed, so we reuse blob SHAs that already exist remotely).
//
// Deliberately NOT synced: settings.json (holds this device's encrypted API keys
// and the GitHub token itself) and the re-derivable text/ extraction cache.

const API = "https://api.github.com";
const REPO = "uninote-library"; // private repo the library lives in
const BRANCH = "main";
const DB_FILE = "library.json"; // at the repo root
const LIB_PREFIX = "library/"; // the file tree under repo/library/
const MAX_FILE = 90 * 1024 * 1024; // stay under GitHub's ~100MB blob limit
const SKIP = new Set([".DS_Store", "Thumbs.db"]);

function requireToken() {
  const t = store.getGithubToken();
  if (!t) throw new Error("Connect your GitHub account first.");
  return t;
}

async function ghFetch(pathname, opts, token) {
  const res = await fetch(API + pathname, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...((opts && opts.headers) || {}),
    },
  });
  if (!res.ok) {
    let msg = await res.text();
    try { msg = JSON.parse(msg).message || msg; } catch {}
    throw new Error(`GitHub ${res.status}: ${String(msg).slice(0, 200)}`);
  }
  return res.json();
}

// git's blob object id: sha1("blob <len>\0<bytes>"). Matches what GitHub stores,
// so we can compare a local file against the remote tree without uploading it.
function gitBlobSha(buf) {
  return crypto.createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

function commitMessage() {
  let host = "a device";
  try { host = os.hostname() || host; } catch {}
  return `UniNote sync from ${host} · ${new Date().toISOString()}`;
}

async function currentUser(token) {
  const u = await ghFetch("/user", {}, token);
  return u.login;
}

async function ensureRepo(token, owner) {
  try {
    await ghFetch(`/repos/${owner}/${REPO}`, {}, token);
    return;
  } catch (e) {
    if (!/GitHub 404/.test(e.message)) throw e;
  }
  await ghFetch("/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: REPO,
      private: true,
      auto_init: false,
      description: "UniNote library sync — managed by the UniNote app.",
    }),
  }, token);
}

async function remoteHead(token, owner) {
  try {
    const ref = await ghFetch(`/repos/${owner}/${REPO}/git/ref/heads/${BRANCH}`, {}, token);
    return ref.object.sha;
  } catch (e) {
    if (/GitHub 404/.test(e.message)) return null; // empty or missing repo
    throw e;
  }
}

// Map a remote repo path back to an absolute local path, refusing anything that
// would escape the library folder (path-traversal guard).
function repoToLocal(repoPath) {
  if (repoPath === DB_FILE) return library.dbPath();
  if (repoPath.startsWith(LIB_PREFIX)) {
    const root = path.resolve(library.libRoot());
    const local = path.resolve(path.join(root, repoPath.slice(LIB_PREFIX.length)));
    if (local !== root && !local.startsWith(root + path.sep)) return null;
    return local;
  }
  return null;
}

// Every local file that belongs to the account: library.json + the library tree.
function walkLocal() {
  const files = [];
  const skipped = [];
  const db = library.dbPath();
  if (fs.existsSync(db)) files.push({ repoPath: DB_FILE, absPath: db });

  const root = library.libRoot();
  const walk = (dir, rel) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (SKIP.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name; // posix separators for the repo
      if (e.isDirectory()) walk(abs, r);
      else if (e.isFile()) {
        let size = 0;
        try { size = fs.statSync(abs).size; } catch { continue; }
        if (size > MAX_FILE) { skipped.push(`${LIB_PREFIX}${r}`); continue; }
        files.push({ repoPath: `${LIB_PREFIX}${r}`, absPath: abs });
      }
    }
  };
  walk(root, "");
  return { files, skipped };
}

async function connect(token) {
  const login = await currentUser(token); // throws on an invalid token
  store.setGithubToken(token);
  try {
    await ensureRepo(token, login);
  } catch (e) {
    return {
      ok: false,
      login,
      error: `Signed in as ${login}, but couldn't reach the sync repo — the token needs "repo" scope. (${e.message})`,
    };
  }
  return { ok: true, login, repo: `${login}/${REPO}` };
}

function disconnect() {
  store.setGithubToken(null);
  store.saveSettings({ syncRepo: null, syncOwner: "", lastSyncCommit: null, lastSyncAt: null });
  return { ok: true };
}

async function status() {
  const token = store.getGithubToken();
  if (!token) return { connected: false };
  try {
    const login = await currentUser(token);
    const head = await remoteHead(token, login).catch(() => null);
    const s = store.getSettings();
    return {
      connected: true,
      login,
      repo: `${login}/${REPO}`,
      hasRemote: !!head,
      lastSyncAt: s.lastSyncAt || null,
      remoteAhead: !!(head && s.lastSyncCommit && head !== s.lastSyncCommit),
    };
  } catch (e) {
    return { connected: false, error: e.message || String(e) };
  }
}

// Back up this device's library to the account. Refuses to overwrite an account
// copy that has moved on since our last sync (another device backed up) unless
// force is set — so Restore-first is the default and clobbering is a choice.
async function push({ force = false } = {}) {
  const token = requireToken();
  const owner = await currentUser(token);
  await ensureRepo(token, owner);
  const head = await remoteHead(token, owner);

  const s = store.getSettings();
  if (!force && head && s.lastSyncCommit && head !== s.lastSyncCommit) {
    return {
      ok: false,
      conflict: true,
      note: "This account has newer changes backed up from another device. Restore first, or force the back-up to overwrite the account copy.",
    };
  }

  // Build path -> blob-sha from the current remote tree so unchanged files are
  // reused instead of re-uploaded.
  const baseTree = {};
  if (head) {
    const commit = await ghFetch(`/repos/${owner}/${REPO}/git/commits/${head}`, {}, token);
    const tree = await ghFetch(`/repos/${owner}/${REPO}/git/trees/${commit.tree.sha}?recursive=1`, {}, token);
    if (!tree.truncated) for (const e of tree.tree) if (e.type === "blob") baseTree[e.path] = e.sha;
  }

  const { files, skipped } = walkLocal();
  if (!files.length) return { ok: false, error: "Nothing to back up yet." };

  let uploaded = 0;
  const entries = [];
  for (const f of files) {
    const buf = fs.readFileSync(f.absPath);
    const sha = gitBlobSha(buf);
    let useSha = sha;
    if (baseTree[f.repoPath] !== sha) {
      const blob = await ghFetch(`/repos/${owner}/${REPO}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: buf.toString("base64"), encoding: "base64" }),
      }, token);
      useSha = blob.sha;
      uploaded++;
    }
    entries.push({ path: f.repoPath, mode: "100644", type: "blob", sha: useSha });
  }

  // A fresh tree (no base_tree) lists exactly the current files, so anything
  // deleted locally disappears from the account too.
  const newTree = await ghFetch(`/repos/${owner}/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree: entries }),
  }, token);
  const commit = await ghFetch(`/repos/${owner}/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: commitMessage(), tree: newTree.sha, parents: head ? [head] : [] }),
  }, token);

  if (head) {
    await ghFetch(`/repos/${owner}/${REPO}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: !!force }),
    }, token);
  } else {
    await ghFetch(`/repos/${owner}/${REPO}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }),
    }, token);
  }

  const at = new Date().toISOString();
  store.saveSettings({ syncRepo: `${owner}/${REPO}`, syncOwner: owner, lastSyncCommit: commit.sha, lastSyncAt: at });
  return { ok: true, commit: commit.sha, uploaded, files: files.length, skipped, at };
}

// Replace this device's library with the account copy.
async function pull() {
  const token = requireToken();
  const owner = await currentUser(token);
  const head = await remoteHead(token, owner);
  if (!head) return { ok: false, error: "This account has no back-up yet — back up from another device first." };

  const commit = await ghFetch(`/repos/${owner}/${REPO}/git/commits/${head}`, {}, token);
  const tree = await ghFetch(`/repos/${owner}/${REPO}/git/trees/${commit.tree.sha}?recursive=1`, {}, token);
  if (tree.truncated) return { ok: false, error: "The account library is too large to restore in one request." };

  const remote = new Map();
  for (const e of tree.tree) if (e.type === "blob") remote.set(e.path, e.sha);

  let downloaded = 0;
  for (const [repoPath, sha] of remote) {
    const local = repoToLocal(repoPath);
    if (!local) continue; // unknown/unsafe path — skip
    if (fs.existsSync(local) && gitBlobSha(fs.readFileSync(local)) === sha) continue; // already current
    const blob = await ghFetch(`/repos/${owner}/${REPO}/git/blobs/${sha}`, {}, token);
    const buf = Buffer.from(blob.content, blob.encoding === "base64" ? "base64" : "utf8");
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, buf);
    downloaded++;
  }

  // Mirror deletions: drop local library files the account no longer has.
  let deleted = 0;
  const { files } = walkLocal();
  for (const f of files) {
    if (!remote.has(f.repoPath)) {
      try { fs.unlinkSync(f.absPath); deleted++; } catch {}
    }
  }

  const at = new Date().toISOString();
  store.saveSettings({ syncRepo: `${owner}/${REPO}`, syncOwner: owner, lastSyncCommit: head, lastSyncAt: at });
  return { ok: true, files: remote.size, downloaded, deleted, at };
}

module.exports = { connect, disconnect, status, push, pull, gitBlobSha, walkLocal };
