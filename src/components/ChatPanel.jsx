import React, { useEffect, useRef, useState } from "react";
import { md } from "../util.js";

const api = window.uninote;
let reqCounter = 0;

export default function ChatPanel({ open, setOpen, scope, scopeLabel, refresh }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);
  const activeReq = useRef(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const offDelta = api.onChatDelta(({ reqId, text }) => {
      if (reqId !== activeReq.current) return;
      setMessages((ms) => {
        const copy = [...ms];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          copy[copy.length - 1] = { ...last, text: last.text + text };
        }
        return copy;
      });
    });
    const offDone = api.onChatDone(({ reqId, text, contextSource, changed }) => {
      if (reqId !== activeReq.current) return;
      setMessages((ms) => {
        const copy = [...ms];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = { role: "assistant", text, contextSource };
        }
        return copy;
      });
      setBusy(false);
      // The assistant edited the timetable or a note — reload the library so the UI reflects it.
      if (changed) refreshRef.current?.();
    });
    const offError = api.onChatError(({ reqId, error }) => {
      if (reqId !== activeReq.current) return;
      setMessages((ms) => {
        const copy = [...ms];
        copy[copy.length - 1] = { role: "assistant", text: "⚠️ " + error, error: true };
        return copy;
      });
      setBusy(false);
    });
    return () => {
      offDelta();
      offDone();
      offError();
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    const reqId = `req_${++reqCounter}`;
    activeReq.current = reqId;
    setMessages((ms) => [
      ...ms,
      { role: "user", text: q },
      { role: "assistant", text: "", streaming: true },
    ]);
    await api.sendChat(reqId, scope, q, history);
  };

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} title="Ask Claude">
        💬
      </button>
    );
  }

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <div>
          <div className="chat-title">Ask AI</div>
          <div className="chat-scope">about: {scopeLabel}</div>
        </div>
        <button className="btn tiny" onClick={() => setOpen(false)}>✕</button>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            Ask anything about the notes in your current location — “what did lecture 3 cover?”,
            “explain assignment 2's requirements”.
            <br /><br />
            I can also make changes for you: “add a STAT201 lecture Monday 9–10”, “write me a note
            summarising week 4”, or “tidy up my Intro note”.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === "assistant" ? (
              <>
                <div className="chat-md" dangerouslySetInnerHTML={md(m.text || (m.streaming ? "…" : ""))} />
                {m.contextSource === "graphify" && (
                  <div className="chat-source">answered via knowledge graph</div>
                )}
              </>
            ) : (
              m.text
            )}
          </div>
        ))}
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "Thinking…" : "Ask about your notes…"}
          disabled={busy}
        />
        <button className="btn primary" type="submit" disabled={busy || !input.trim()}>
          ➤
        </button>
      </form>
    </aside>
  );
}
