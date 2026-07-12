import React, { useMemo } from "react";
import { collectDeadlines, DeadlineRow } from "./DeadlinesView.jsx";

export default function HomeView({ lib, setSel }) {
  const totalDocs = lib.docs.length;
  const totalSummaries = lib.docs.reduce((n, d) => n + d.summaries.length, 0);
  const deadlines = useMemo(() => collectDeadlines(lib), [lib]);

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <div className="crumbs">Welcome back</div>
          <h1>Your notes</h1>
        </div>
      </header>

      <div className="stat-row">
        <div className="stat"><div className="stat-num">{lib.years.length}</div><div className="stat-label">years</div></div>
        <div className="stat"><div className="stat-num">{totalDocs}</div><div className="stat-label">documents</div></div>
        <div className="stat"><div className="stat-num">{totalSummaries}</div><div className="stat-label">AI summaries</div></div>
        <div className="stat"><div className="stat-num">{lib.tests.length}</div><div className="stat-label">tests</div></div>
      </div>

      {deadlines.length > 0 && (
        <section className="category-section">
          <h2>
            🗓️ Coming up
            <button className="btn tiny see-all" onClick={() => setSel({ kind: "deadlines" })}>
              See all →
            </button>
          </h2>
          <div className="deadline-list">
            {deadlines.slice(0, 5).map((i, k) => (
              <DeadlineRow key={k} item={i} setSel={setSel} />
            ))}
          </div>
        </section>
      )}

      {lib.years.length === 0 ? (
        <div className="empty-state big">
          <h2>Let's set up your degree</h2>
          <p>
            Add your first <strong>year</strong> in the sidebar, then a <strong>semester</strong>{" "}
            under it, then your <strong>papers</strong>. After that, just drag any lecture notes,
            slides or assignments into this window — Claude files and summarises them for you.
          </p>
        </div>
      ) : (
        <div className="paper-grid">
          {lib.years.map((y) => (
            <div key={y.id} className="paper-card" onClick={() => setSel({ kind: "year", yearId: y.id })}>
              <div className="paper-code">{y.name}</div>
              <div className="paper-count">
                {y.semesters.length} semester{y.semesters.length === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="home-tip">
        💡 You can drop files anywhere, any time — even on this screen. Ask the assistant on the
        right about anything in your current location.
      </div>
    </div>
  );
}
