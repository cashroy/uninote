import React, { useState } from "react";

const api = window.uninote;

function AddInline({ placeholder, onAdd, small }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (!editing)
    return (
      <button className={`add-inline ${small ? "small" : ""}`} onClick={() => setEditing(true)}>
        + {placeholder}
      </button>
    );
  return (
    <form
      className="add-inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (value.trim()) {
          await onAdd(value.trim());
          setValue("");
          setEditing(false);
        }
      }}
    >
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setEditing(false);
          setValue("");
        }}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      />
    </form>
  );
}

export default function Sidebar({ lib, sel, setSel, refresh, onSearch }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const docCount = (paperId) => lib.docs.filter((d) => d.paperId === paperId).length;

  return (
    <aside className="sidebar">
      <div
        className={`brand ${sel.kind === "all" ? "active" : ""}`}
        onClick={() => setSel({ kind: "all" })}
      >
        <span className="brand-mark">Uni</span>Note
      </div>

      <button className="search-trigger" onClick={onSearch} title="Search everything (Ctrl+K)">
        🔍 Search… <span className="kbd">Ctrl K</span>
      </button>

      <button
        className={`nav-btn deadline-nav ${sel.kind === "calendar" ? "active" : ""}`}
        onClick={() => setSel({ kind: "calendar" })}
      >
        📅 Calendar
      </button>
      <button
        className={`nav-btn deadline-nav ${sel.kind === "deadlines" ? "active" : ""}`}
        onClick={() => setSel({ kind: "deadlines" })}
      >
        🗓️ Deadlines
      </button>
      <button
        className={`nav-btn deadline-nav ${sel.kind === "alldocs" ? "active" : ""}`}
        onClick={() => setSel({ kind: "alldocs" })}
      >
        📄 All documents
      </button>

      <div className="tree">
        {lib.years.map((y) => (
          <div key={y.id} className="tree-year">
            <div
              className={`tree-row year ${sel.kind === "year" && sel.yearId === y.id ? "active" : ""}`}
            >
              <button className="chev" onClick={() => toggle(y.id)}>
                {collapsed[y.id] ? "▸" : "▾"}
              </button>
              <span
                className="tree-label"
                onClick={() => setSel({ kind: "year", yearId: y.id })}
              >
                {y.name}
              </span>
            </div>
            {!collapsed[y.id] && (
              <div className="tree-children">
                {y.semesters.map((s) => (
                  <div key={s.id}>
                    <div
                      className={`tree-row sem ${sel.kind === "semester" && sel.semId === s.id ? "active" : ""}`}
                    >
                      <button className="chev" onClick={() => toggle(s.id)}>
                        {collapsed[s.id] ? "▸" : "▾"}
                      </button>
                      <span
                        className="tree-label"
                        onClick={() => setSel({ kind: "semester", semId: s.id, yearId: y.id })}
                      >
                        {s.name}
                      </span>
                    </div>
                    {!collapsed[s.id] && (
                      <div className="tree-children">
                        {s.papers.map((p) => (
                          <div
                            key={p.id}
                            className={`tree-row paper ${sel.kind === "paper" && sel.paperId === p.id ? "active" : ""}`}
                            onClick={() =>
                              setSel({ kind: "paper", paperId: p.id, semId: s.id, yearId: y.id })
                            }
                          >
                            <span className="paper-dot" />
                            <span className="tree-label">
                              {p.code}
                              {p.name ? <em className="paper-name"> {p.name}</em> : null}
                            </span>
                            <span className="count">{docCount(p.id) || ""}</span>
                          </div>
                        ))}
                        <AddInline
                          small
                          placeholder="Add paper"
                          onAdd={async (v) => {
                            const [code, ...rest] = v.split(/\s*[—:-]\s*/);
                            await api.addPaper(s.id, code, rest.join(" "));
                            await refresh();
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
                <AddInline
                  small
                  placeholder="Add semester"
                  onAdd={async (v) => {
                    await api.addSemester(y.id, v);
                    await refresh();
                  }}
                />
              </div>
            )}
          </div>
        ))}
        <AddInline
          placeholder="Add year"
          onAdd={async (v) => {
            await api.addYear(v);
            await refresh();
          }}
        />
      </div>

      <div className="sidebar-footer">
        <button
          className={`nav-btn ${sel.kind === "settings" ? "active" : ""}`}
          onClick={() => setSel({ kind: "settings" })}
        >
          ⚙️ Settings
        </button>
      </div>
    </aside>
  );
}
