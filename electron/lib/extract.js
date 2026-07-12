const fs = require("fs");
const path = require("path");

const TEXT_EXTS = [
  ".txt", ".md", ".markdown", ".csv", ".json", ".tex",
  ".py", ".js", ".ts", ".java", ".c", ".cpp", ".cs", ".r", ".sql", ".html",
];

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === ".pdf") {
      // require the inner module directly to skip pdf-parse's debug harness
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const data = await pdfParse(fs.readFileSync(filePath));
      return data.text || "";
    }
    if (ext === ".docx") {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || "";
    }
    if (ext === ".xlsx") {
      const AdmZip = require("adm-zip");
      const zip = new AdmZip(filePath);
      const stripTags = (s) =>
        s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      // shared string table
      const shared = [];
      const ss = zip.getEntry("xl/sharedStrings.xml");
      if (ss) {
        const xml = ss.getData().toString("utf8");
        for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) || []) {
          const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => stripTags(m[1]));
          shared.push(parts.join(""));
        }
      }
      // every worksheet, preserving row/cell layout
      const sheets = zip
        .getEntries()
        .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.entryName))
        .sort((a, b) => a.entryName.localeCompare(b.entryName));
      const out = [];
      for (const sheet of sheets) {
        const xml = sheet.getData().toString("utf8");
        for (const row of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
          const cells = [];
          for (const c of row.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
            const t = (c.match(/\bt="([^"]+)"/) || [])[1];
            if (t === "s") {
              const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
              cells.push(shared[parseInt(v, 10)] || "");
            } else if (t === "inlineStr") {
              const v = (c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "";
              cells.push(stripTags(v));
            } else {
              const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || "";
              cells.push(stripTags(v));
            }
          }
          if (cells.some((x) => x.trim())) out.push(cells.join("\t"));
        }
      }
      return out.join("\n");
    }
    if (ext === ".pptx") {
      const AdmZip = require("adm-zip");
      const zip = new AdmZip(filePath);
      const slides = zip
        .getEntries()
        .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
        .sort((a, b) => {
          const num = (e) => parseInt(e.entryName.match(/slide(\d+)\.xml/)[1], 10);
          return num(a) - num(b);
        });
      const parts = [];
      for (const s of slides) {
        const xml = s.getData().toString("utf8");
        const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
          m[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
        );
        if (texts.length) parts.push(texts.join(" "));
      }
      return parts.join("\n\n");
    }
    if (TEXT_EXTS.includes(ext)) {
      return fs.readFileSync(filePath, "utf8");
    }
  } catch (err) {
    console.error("extractText failed for", filePath, err.message);
  }
  return "";
}

module.exports = { extractText };
