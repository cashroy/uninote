import React, { useEffect, useMemo, useState } from "react";
import { md, parseFlashcards, gradeCard } from "../util.js";
import { Layers, PartyPopper, X } from "lucide-react";

const api = window.uninote;

// Spaced-repetition review of one flashcard summary (a "set").
// Per-card scheduling state is stored under the summary's id.
export default function FlashcardReview({ summary, onClose }) {
  const [cards, setCards] = useState(null);
  const [state, setState] = useState({}); // cardIdx -> {reps, intervalDays, ease, due}
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  useEffect(() => {
    (async () => {
      const content = await api.readFile(summary.absPath);
      const parsed = parseFlashcards(content);
      setCards(parsed);
      const saved = (await api.flashGet(summary.id)) || { cards: {} };
      setState(saved.cards || {});
      const now = Date.now();
      const due = [];
      const fresh = [];
      parsed.forEach((_, i) => {
        const s = saved.cards?.[i];
        if (!s) fresh.push(i);
        else if (!s.due || new Date(s.due).getTime() <= now) due.push(i);
      });
      let q = [...due, ...fresh];
      if (q.length === 0) q = parsed.map((_, i) => i); // nothing due — review all
      setQueue(q);
    })();
  }, []);

  const dueCount = useMemo(() => queue.length - pos, [queue, pos]);

  const grade = async (g) => {
    const idx = queue[pos];
    const next = gradeCard(state[idx], g);
    const newState = { ...state, [idx]: next };
    setState(newState);
    setCounts((c) => ({ ...c, [g]: c[g] + 1 }));
    await api.flashSave(summary.id, { cards: newState, lastReviewed: new Date().toISOString() });

    setFlipped(false);
    if (g === "again") setQueue((q) => [...q, idx]); // requeue at end of session
    setPos((p) => p + 1);
  };

  useEffect(() => {
    if (queue.length && pos >= queue.length) setDone(true);
  }, [pos, queue]);

  if (!cards) return null;

  if (cards.length === 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2><Layers size={18} /> Flashcards</h2>
          <p>Couldn't find any Q/A cards in this summary.</p>
          <div className="modal-actions">
            <button className="btn primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    const total = counts.again + counts.hard + counts.good + counts.easy;
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2><PartyPopper size={18} /> Session complete</h2>
          <p className="modal-sub">{total} reviews — again {counts.again} · hard {counts.hard} · good {counts.good} · easy {counts.easy}</p>
          <p className="muted">Cards you graded come back when they're due — harder cards sooner, easy ones later.</p>
          <div className="modal-actions">
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  const idx = queue[pos];
  const card = cards[idx];

  return (
    <div className="modal-backdrop">
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          <h2><Layers size={18} /> {summary.fileName.replace(/\.md$/i, "")}</h2>
          <div className="editor-status-row">
            <span className="muted">{dueCount} left</span>
            <button className="btn tiny" onClick={onClose}><X size={14} /></button>
          </div>
        </div>

        <div
          className={`flashcard ${flipped ? "flipped" : ""}`}
          onClick={() => setFlipped(true)}
          title={flipped ? "" : "Click to reveal"}
        >
          <div className="flash-label">{flipped ? "Answer" : "Question"}</div>
          <div className="flash-content" dangerouslySetInnerHTML={md(flipped ? card.a : card.q)} />
          {!flipped && <div className="flash-hint">click to reveal</div>}
        </div>

        {flipped ? (
          <div className="grade-row">
            <button className="btn grade again" onClick={() => grade("again")}>Again<span>&lt;1d</span></button>
            <button className="btn grade hard" onClick={() => grade("hard")}>Hard</button>
            <button className="btn grade good" onClick={() => grade("good")}>Good</button>
            <button className="btn grade easy" onClick={() => grade("easy")}>Easy</button>
          </div>
        ) : (
          <div className="grade-row">
            <button className="btn primary" onClick={() => setFlipped(true)}>Show answer</button>
          </div>
        )}
      </div>
    </div>
  );
}
