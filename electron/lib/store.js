const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  onboarded: false,
  backend: "claude-code", // "claude-code" | "api" | "gemini"
  apiKeyEnc: null, // base64 of safeStorage-encrypted key
  apiKeyPlain: null, // fallback when safeStorage unavailable
  model: "claude-opus-4-8",
  geminiKeyEnc: null, // Google AI Studio key (encrypted)
  geminiKeyPlain: null,
  geminiModel: "gemini-flash-latest", // alias → newest flash, avoids model sunsets
  indexMode: "builtin", // "builtin" | "graphify"
  theme: "mono", // "mono" (minimal B&W, default) | "paper" | "dark"
  university: "", // used to look up semester/break dates
};

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

// Gemini models that Google has retired for new users — migrate to the alias.
const DEAD_GEMINI_MODELS = new Set(["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]);

function getSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    const merged = { ...DEFAULTS, ...raw };
    if (!merged.geminiModel || DEAD_GEMINI_MODELS.has(merged.geminiModel)) {
      merged.geminiModel = DEFAULTS.geminiModel;
    }
    return merged;
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

function setGeminiKey(key) {
  if (!key) {
    saveSettings({ geminiKeyEnc: null, geminiKeyPlain: null });
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    saveSettings({ geminiKeyEnc: safeStorage.encryptString(key).toString("base64"), geminiKeyPlain: null });
  } else {
    saveSettings({ geminiKeyEnc: null, geminiKeyPlain: key });
  }
}

function getGeminiKey() {
  const s = getSettings();
  if (s.geminiKeyEnc) {
    try {
      return safeStorage.decryptString(Buffer.from(s.geminiKeyEnc, "base64"));
    } catch {
      return null;
    }
  }
  return s.geminiKeyPlain || null;
}

module.exports = { getSettings, saveSettings, setApiKey, getApiKey, setGeminiKey, getGeminiKey };
