import React from "react";
import {
  FileText, FileImage, File, Presentation, NotebookPen,
  GraduationCap, Wrench, Compass, PencilLine, FlaskConical,
  BookOpen, FolderArchive, Package, Folder,
  Calendar, CalendarDays, BookText, Sparkles, Pin, ClipboardList,
} from "lucide-react";

// Real SVG replacements for the old emoji "icon" maps. Each inherits currentColor
// and takes a size prop, so they theme and scale like any other lucide icon.

export function FileIcon({ fileName, isNote, size = 18, ...rest }) {
  if (isNote) return <NotebookPen size={size} {...rest} />;
  const ext = (String(fileName || "").split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return <FileImage size={size} {...rest} />;
  if (ext === "pptx" || ext === "ppt") return <Presentation size={size} {...rest} />;
  if (["pdf", "docx", "doc", "md", "txt"].includes(ext)) return <FileText size={size} {...rest} />;
  return <File size={size} {...rest} />;
}

const CATEGORY = {
  "Notes": NotebookPen,
  "Lecture Notes": GraduationCap,
  "Workshops": Wrench,
  "Tutorials": Compass,
  "Assignments": PencilLine,
  "Labs": FlaskConical,
  "Readings": BookOpen,
  "Past Papers": FolderArchive,
  "Other": Package,
};

export function CategoryIcon({ category, size = 16, ...rest }) {
  const I = CATEGORY[category] || Folder;
  return <I size={size} {...rest} />;
}

const TYPE = {
  year: Calendar,
  semester: CalendarDays,
  paper: BookText,
  document: FileText,
  note: NotebookPen,
  summary: Sparkles,
  "side notes": Pin,
  test: ClipboardList,
};

export function TypeIcon({ type, size = 16, ...rest }) {
  const I = TYPE[type] || FileText;
  return <I size={size} {...rest} />;
}
