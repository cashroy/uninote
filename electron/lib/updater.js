const { app } = require("electron");

// Auto-update via electron-updater, reading GitHub Releases (configured in
// package.json build.publish). Only active for the installed (NSIS) build —
// portable and dev runs can't self-update, so they no-op cleanly.

let autoUpdater = null;
let sendFn = () => {};
let wired = false;

function isPortable() {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
}

function canUpdate() {
  return app.isPackaged && !isPortable();
}

function getUpdater() {
  if (!autoUpdater) {
    autoUpdater = require("electron-updater").autoUpdater;
    autoUpdater.autoDownload = false; // ask the user first
    autoUpdater.autoInstallOnAppQuit = true;
  }
  return autoUpdater;
}

function init(send) {
  sendFn = send;
  if (!canUpdate() || wired) return;
  const u = getUpdater();
  u.on("checking-for-update", () => sendFn("update:status", { status: "checking" }));
  u.on("update-available", (info) => sendFn("update:status", { status: "available", version: info.version }));
  u.on("update-not-available", (info) => sendFn("update:status", { status: "none", version: info.version }));
  u.on("error", (err) => sendFn("update:status", { status: "error", error: String((err && err.message) || err) }));
  u.on("download-progress", (p) => sendFn("update:status", { status: "downloading", percent: Math.round(p.percent) }));
  u.on("update-downloaded", (info) => sendFn("update:status", { status: "ready", version: info.version }));
  wired = true;
}

async function check() {
  if (!canUpdate()) return { status: "unsupported" };
  try {
    await getUpdater().checkForUpdates();
    return { status: "checking" };
  } catch (e) {
    return { status: "error", error: String((e && e.message) || e) };
  }
}

async function download() {
  if (!canUpdate()) return { ok: false, error: "unsupported" };
  try {
    await getUpdater().downloadUpdate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function install() {
  if (!canUpdate()) return;
  getUpdater().quitAndInstall();
}

module.exports = { init, check, download, install, canUpdate };
