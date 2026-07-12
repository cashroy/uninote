import React from "react";

export default function YearView({ lib, yearId, setSel }) {
  const year = lib.years.find((y) => y.id === yearId);
  if (!year) return <div className="empty-state">Year not found.</div>;

  const docCountSem = (s) => {
    const pids = s.papers.map((p) => p.id);
    return lib.docs.filter((d) => pids.includes(d.paperId)).length;
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <div className="crumbs">Your degree</div>
          <h1>{year.name}</h1>
        </div>
      </header>
      {year.semesters.length === 0 && (
        <div className="empty-state"><p>No semesters yet — add one from the sidebar.</p></div>
      )}
      <div className="paper-grid">
        {year.semesters.map((s) => (
          <div
            key={s.id}
            className="paper-card"
            onClick={() => setSel({ kind: "semester", semId: s.id, yearId })}
          >
            <div className="paper-code">{s.name}</div>
            <div className="paper-count">
              {s.papers.length} paper{s.papers.length === 1 ? "" : "s"} · {docCountSem(s)} document
              {docCountSem(s) === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
