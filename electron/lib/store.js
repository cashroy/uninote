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
  universityCountry: "", // country/region the university is in
  dateFormat: "system", // "system" | "dmy" | "mdy" | "ymd"
  githubTokenEnc: null, // GitHub PAT (gist scope) for publishing calendars
  githubTokenPlain: null,
  gistId: null, // the gist the calendars live in (updated in place)
  gistOwner: "", // gist owner login, for building the raw subscribe URL
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

function setGithubToken(key) {
  if (!key) {
    saveSettings({ githubTokenEnc: null, githubTokenPlain: null });
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    saveSettings({ githubTokenEnc: safeStorage.encryptString(key).toString("base64"), githubTokenPlain: null });
  } else {
    saveSettings({ githubTokenEnc: null, githubTokenPlain: key });
  }
}

function getGithubToken() {
  const s = getSettings();
  if (s.githubTokenEnc) {
    try {
      return safeStorage.decryptString(Buffer.from(s.githubTokenEnc, "base64"));
    } catch {
      return null;
    }
  }
  return s.githubTokenPlain || null;
}

module.exports = { getSettings, saveSettings, setApiKey, getApiKey, setGeminiKey, getGeminiKey, setGithubToken, getGithubToken };
