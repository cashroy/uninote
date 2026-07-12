import React, { useCallback, useEffect, useMemo, useState } from "react";
import Onboarding from "./components/Onboarding.jsx";
import Sidebar from "./components/Sidebar.jsx";
import PaperView from "./components/PaperView.jsx";
import SemesterView from "./components/SemesterView.jsx";
import YearView from "./components/YearView.jsx";
import HomeView from "./components/HomeView.jsx";
import SettingsView from "./components/SettingsView.jsx";
import DeadlinesView from "./components/DeadlinesView.jsx";
import CalendarView from "./components/CalendarView.jsx";
import AllDocsView from "./components/AllDocsView.jsx";
import SearchOverlay from "./components/SearchOverlay.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import IngestFlow from "./components/IngestFlow.jsx";
import WindowControls from "./components/WindowControls.jsx";
import UpdateNotice from "./components/UpdateNotice.jsx";

const api = window.uninote;

export default function App() {
  const [settings, setSettings] = useState(null);
  const [lib, setLib] = useState(null);
  const [sel, setSel] = useState({ kind: "all" });
  const [chatOpen, setChatOpen] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  const [droppedPaths, setDroppedPaths] = useState(null); // paths awaiting ingest
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / Ctrl+F opens global search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "f")) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refresh = useCallback(async () => {
    setLib(await api.getLibrary());
  }, []);

  useEffect(() => {
    (async () => {
      const s = await api.getSettings();
      document.documentElement.dataset.theme = s.theme || "mono";
      setSettings(s);
      await refresh();
    })();
  }, [refresh]);

  // keep the applied theme in sync whenever settings change
  useEffect(() => {
    if (settings?.theme) document.documentElement.dataset.theme = settings.theme;
  }, [settings?.theme]);

  // -------- global drag & drop ------------------------------------------
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e) => {
      e.preventDefault();
      if (e.dataTransfer?.types?.includes("Files")) {
        depth++;
        setDropActive(true);
      }
    };
    const onDragOver = (e) => e.preventDefault();
    const onDragLeave = (e) => {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropActive(false);
    };
    const onDrop = (e) => {
      e.preventDefault();
      depth = 0;
      setDropActive(false);
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      const paths = files.map((f) => api.pathForFile(f)).filter(Boolean);
      if (paths.length) setDroppedPaths(paths);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const scope = useMemo(() => {
    if (sel.kind === "paper") return { kind: "paper", id: sel.paperId };
    if (sel.kind === "semester") return { kind: "semester", id: sel.semId };
    if (sel.kind === "year") return { kind: "year", id: sel.yearId };
    return { kind: "all" };
  }, [sel]);

  const scopeLabel = useMemo(() => {
    if (!lib) return "";
    if (sel.kind === "paper") {
      for (const y of lib.years)
        for (const s of y.semesters) {
          const p = s.papers.find((p) => p.id === sel.paperId);
          if (p) return p.code;
        }
    }
    if (sel.kind === "semester") {
      for (const y of lib.years) {
        const s = y.semesters.find((s) => s.id === sel.semId);
        if (s) return `${y.name} · ${s.name}`;
      }
    }
    if (sel.kind === "year") {
      const y = lib.years.find((y) => y.id === sel.yearId);
      if (y) return y.name;
    }
    return "All notes";
  }, [lib, sel]);

  if (!settings || !lib) return <div className="loading">Loading…</div>;

  if (!settings.onboarded) {
    return (
      <>
        <div className="titlebar onboarding-titlebar">
          <div className="titlebar-drag-fill" />
          <WindowControls />
        </div>
        <Onboarding onDone={async () => setSettings(await api.getSettings())} />
      </>
    );
  }

  let view = null;
  if (sel.kind === "deadlines") {
    view = <DeadlinesView lib={lib} setSel={setSel} refresh={refresh} />;
  } else if (sel.kind === "calendar") {
    view = <CalendarView lib={lib} setSel={setSel} refresh={refresh} />;
  } else if (sel.kind === "alldocs") {
    view = <AllDocsView lib={lib} setSel={setSel} />;
  } else if (sel.kind === "settings") {
    view = <SettingsView settings={settings} onSettingsChanged={async () => setSettings(await api.getSettings())} />;
  } else if (sel.kind === "paper") {
    view = <PaperView lib={lib} paperId={sel.paperId} refresh={refresh} onUpload={(paths) => setDroppedPaths(paths)} />;
  } else if (sel.kind === "semester") {
    view = <SemesterView lib={lib} semId={sel.semId} refresh={refresh} setSel={setSel} />;
  } else if (sel.kind === "year") {
    view = <YearView lib={lib} yearId={sel.yearId} refresh={refresh} setSel={setSel} />;
  } else {
    view = <HomeView lib={lib} refresh={refresh} setSel={setSel} />;
  }

  return (
    <div className="app">
      <div className="titlebar">
        <div className="titlebar-drag-fill" />
        <WindowControls />
      </div>
      <div className="app-body">
        <Sidebar
          lib={lib}
          sel={sel}
          setSel={setSel}
          refresh={refresh}
          onSearch={() => setSearchOpen(true)}
        />
        <main className="main">{view}</main>
        <ChatPanel
          open={chatOpen}
          setOpen={setChatOpen}
          scope={scope}
          scopeLabel={scopeLabel}
        />
      </div>
      {dropActive && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            <div className="drop-icon">⬇️</div>
            <h2>Drop your files</h2>
            <p>They'll be classified by Claude and filed automatically.</p>
          </div>
        </div>
      )}
      <UpdateNotice />
      {searchOpen && (
        <SearchOverlay onClose={() => setSearchOpen(false)} onNavigate={(nav) => setSel(nav)} />
      )}
      {droppedPaths && (
        <IngestFlow
          lib={lib}
          sel={sel}
          paths={droppedPaths}
          onClose={() => setDroppedPaths(null)}
          refresh={refresh}
        />
      )}
    </div>
  );
}
