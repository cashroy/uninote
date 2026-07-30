import React, { useEffect, useRef, useState } from "react";
import { TypeIcon } from "../icons.jsx";

const api = window.uninote;

export default function SearchOverlay({ onClose, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setResults(await api.globalSearch(query));
      setActive(0);
      setSearched(true);
    }, 250);
  }, [query]);

  const go = (hit) => {
    onNavigate(hit.nav);
    onClose();
  };

  const onKey = (e) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
    else if (e.key === "Enter" && results[active]) go(results[active]);
  };

  return (
    <div className="modal-backdrop search-backdrop" onClick={onClose}>
      <div className="search-box" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="search-input"
          placeholder="Search everything — papers, notes, documents, summaries, side notes, tests…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="search-results">
          {searched && results.length === 0 && (
            <div className="search-empty">No matches for “{query}”.</div>
          )}
          {results.map((r, i) => (
            <div
              key={i}
              className={`search-hit ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
            >
              <span className="search-icon"><TypeIcon type={r.type} size={17} /></span>
              <div className="search-hit-main">
                <div className="search-title">
                  {r.title} <span className="search-type">{r.type}</span>
                </div>
                {r.where && <div className="search-where">{r.where}</div>}
                {r.snippet && <div className="search-snippet">{r.snippet}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="search-foot">↑↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}
