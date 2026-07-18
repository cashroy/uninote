import React, { useMemo, useState } from "react";
import { dueInfo, fmtDate } from "../util.js";

const api = window.uninote;

function TodoRow({ todo, onToggle, onRemove }) {
  const info = todo.dueDate && !todo.done ? dueInfo(todo.dueDate) : null;
  return (
    <div className={`deadline-row todo-row ${info && info.overdue ? "overdue" : ""} ${todo.done ? "done" : ""}`}>
      <input
        type="checkbox"
        className="todo-check"
        checked={todo.done}
        title={todo.done ? "Mark as not done" : "Mark as done"}
        onChange={() => onToggle(todo.id)}
      />
      <div className="deadline-main">
        <div className="deadline-title">{todo.text}</div>
      </div>
      {todo.dueDate && (
        <div className="deadline-when">
          {info && (
            <div className={`deadline-label ${info.overdue ? "overdue" : info.days <= 3 ? "soon" : ""}`}>
              {info.label}
            </div>
          )}
          <div className="deadline-date">{fmtDate(todo.dueDate)}</div>
        </div>
      )}
      <button className="break-x" title="Delete" onClick={() => onRemove(todo.id)}>×</button>
    </div>
  );
}

export default function TodosView({ lib, refresh }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");

  const todos = lib.todos || [];
  // Dated items first (soonest first), then undated in the order they were added.
  const { open, done } = useMemo(() => {
    const sorted = [...todos].sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
    return { open: sorted.filter((t) => !t.done), done: sorted.filter((t) => t.done) };
  }, [todos]);

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await api.addTodo(text.trim(), due || null);
    setText("");
    setDue("");
    await refresh();
  };
  const toggle = async (id) => {
    await api.toggleTodo(id);
    await refresh();
  };
  const remove = async (id) => {
    await api.removeTodo(id);
    await refresh();
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <div className="crumbs">Everything else</div>
          <h1>To-do</h1>
        </div>
      </header>

      <form className="todo-add" onSubmit={add}>
        <input
          type="text"
          value={text}
          placeholder="Add something to do…"
          onChange={(e) => setText(e.target.value)}
        />
        <input type="date" value={due} title="Due date (optional)" onChange={(e) => setDue(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!text.trim()}>Add</button>
      </form>

      {todos.length === 0 && (
        <div className="empty-state">
          <p>
            Nothing here yet. This is your general to-do list — anything that isn't tied to a paper.
            Add a due date and it'll tell you how long you've got.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section className="category-section">
          <h2>To do</h2>
          <div className="deadline-list">
            {open.map((t) => <TodoRow key={t.id} todo={t} onToggle={toggle} onRemove={remove} />)}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="category-section">
          <h2>Done</h2>
          <div className="deadline-list">
            {done.map((t) => <TodoRow key={t.id} todo={t} onToggle={toggle} onRemove={remove} />)}
          </div>
        </section>
      )}
    </div>
  );
}
