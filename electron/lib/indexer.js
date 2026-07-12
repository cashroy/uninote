const fs = require("fs");

// Lightweight built-in retrieval: TF-IDF scoring over the extracted text of
// the docs in scope, returning excerpt windows around the best matches.
// Used when graphify mode is off or the graph isn't available.

const STOP = new Set(
  "a an and are as at be by for from has have how in is it its of on or that the this to was were what when where which who will with you your".split(" ")
);

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function readDocText(doc) {
  if (!doc.textPath) return "";
  try {
    return fs.readFileSync(doc.textPath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Returns up to `topK` context chunks: { docId, fileName, excerpt, score }
 */
function search(docs, query, topK = 6, excerptChars = 3000) {
  const qTerms = [...new Set(tokenize(query))];
  if (!qTerms.length) return [];

  const corpus = docs
    .map((d) => ({ doc: d, text: readDocText(d) }))
    .filter((e) => e.text.trim());

  const N = corpus.length || 1;
  // document frequency per query term
  const df = {};
  for (const t of qTerms) {
    df[t] = corpus.filter((e) => e.text.toLowerCase().includes(t)).length;
  }

  const scored = corpus
    .map((e) => {
      const lower = e.text.toLowerCase();
      let score = 0;
      let firstHit = -1;
      for (const t of qTerms) {
        let idx = lower.indexOf(t);
        let tf = 0;
        while (idx !== -1) {
          tf++;
          if (firstHit === -1 || idx < firstHit) firstHit = idx;
          idx = lower.indexOf(t, idx + t.length);
          if (tf > 50) break;
        }
        if (tf > 0) {
          const idf = Math.log(1 + N / (df[t] || 1));
          score += (1 + Math.log(tf)) * idf;
        }
      }
      return { ...e, score, firstHit };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((e) => {
    const start = Math.max(0, (e.firstHit === -1 ? 0 : e.firstHit) - 400);
    const excerpt = e.text.slice(start, start + excerptChars);
    return {
      docId: e.doc.id,
      fileName: e.doc.fileName,
      category: e.doc.category,
      excerpt,
      score: e.score,
    };
  });
}

module.exports = { search, readDocText };
