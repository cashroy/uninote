import { marked } from "marked";

export function md(text) {
  return { __html: marked.parse(text || "") };
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

// ---- deadlines -------------------------------------------------------------

// Returns {days, label, overdue} for an ISO date (yyyy-mm-dd)
export function dueInfo(iso) {
  if (!iso) return null;
  const due = new Date(iso + "T23:59:59");
  const days = Math.ceil((due - new Date()) / 86400000);
  let label;
  if (days < 0) label = `${-days} day${days === -1 ? "" : "s"} overdue`;
  else if (days === 0) label = "due today";
  else if (days === 1) label = "due tomorrow";
  else label = `due in ${days} days`;
  return { days, label, overdue: days < 0 };
}

// ---- flashcards --------------------------------------------------------------

// Parses "**Q:** ... **A:** ..." pairs out of a flashcard summary's Markdown.
export function parseFlashcards(markdown) {
  const cards = [];
  const re = /\*\*Q:?\*\*:?([\s\S]*?)\*\*A:?\*\*:?([\s\S]*?)(?=\*\*Q:?\*\*|$)/gi;
  let m;
  while ((m = re.exec(markdown || ""))) {
    const q = m[1].trim();
    const a = m[2].trim().replace(/^[-–—\s]+$/g, "");
    if (q && a) cards.push({ q, a });
  }
  return cards;
}

// SM-2-flavoured scheduling. state: {reps, intervalDays, ease, due}
export function gradeCard(state, grade) {
  const s = state || { reps: 0, intervalDays: 0, ease: 2.5, due: null };
  let { reps, intervalDays, ease } = s;
  if (grade === "again") {
    reps = 0;
    intervalDays = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else if (grade === "hard") {
    intervalDays = Math.max(1, Math.round(intervalDays * 1.2) || 1);
    ease = Math.max(1.3, ease - 0.15);
    reps += 1;
  } else if (grade === "good") {
    intervalDays = reps === 0 ? 1 : Math.round(intervalDays * ease) || 3;
    reps += 1;
  } else if (grade === "easy") {
    intervalDays = reps === 0 ? 3 : Math.round(intervalDays * ease * 1.3) || 5;
    ease += 0.15;
    reps += 1;
  }
  const due = new Date(Date.now() + intervalDays * 86400000).toISOString();
  return { reps, intervalDays, ease, due };
}

export const WEEKS = Array.from({ length: 16 }, (_, i) => i + 1);

export function fileIcon(fileName) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "📕";
  if (ext === "docx" || ext === "doc") return "📘";
  if (ext === "pptx" || ext === "ppt") return "📙";
  if (ext === "md" || ext === "txt") return "📝";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "🖼️";
  return "📄";
}

export const CATEGORY_ICONS = {
  Notes: "🗒️",
  "Lecture Notes": "🎓",
  Workshops: "🛠️",
  Tutorials: "🧭",
  Assignments: "✍️",
  Labs: "🔬",
  Readings: "📖",
  "Past Papers": "🗂️",
  Other: "📦",
};
