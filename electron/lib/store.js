const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  onboarded: false,
  backend: "claude-code", // app ships login-only; "api" kept for power users
  apiKeyEnc: null, // base64 of safeStorage-encrypted key
  apiKeyPlain: null, // fallback when safeStorage unavailable
  model: "claude-opus-4-8",
  indexMode: "builtin", // "builtin" | "graphify"
  theme: "mono", // "mono" (minimal B&W, default) | "paper" | "dark"
  university: "", // used to look up semester/break dates
};

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(patch) {
  const merged = { ...getSettings(), ...patch };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function setApiKey(key) {
  if (!key) {
    saveSettings({ apiKeyEnc: null, apiKeyPlain: null });
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    saveSettings({
      apiKeyEnc: safeStorage.encryptString(key).toString("base64"),
      apiKeyPlain: null,
    });
  } else {
    saveSettings({ apiKeyEnc: null, apiKeyPlain: key });
  }
}

function getApiKey() {
  const s = getSettings();
  if (s.apiKeyEnc) {
    try {
      return safeStorage.decryptString(Buffer.from(s.apiKeyEnc, "base64"));
    } catch {
      return null;
    }
  }
  return s.apiKeyPlain || null;
}

module.exports = { getSettings, saveSettings, setApiKey, getApiKey };
