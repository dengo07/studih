import { useEffect } from "react";
import { useApp } from "../store";
import Sidebar from "./Sidebar";
import QuickSwitcher from "./QuickSwitcher";
import NoteView from "../features/notes/NoteView";
import ReviewView from "../features/review/ReviewView";
import GraphView from "../features/graph/GraphView";
import SettingsView from "../features/settings/SettingsView";
import TutorPanel from "../features/tutor/TutorPanel";
import PlannerView from "../features/planner/PlannerView";
import StatsView from "../features/stats/StatsView";

export default function App() {
  const ready = useApp((s) => s.ready);
  const selectedNoteId = useApp((s) => s.selectedNoteId);
  const switcherOpen = useApp((s) => s.switcherOpen);
  const view = useApp((s) => s.view);
  const tutorOpen = useApp((s) => s.tutorOpen);

  useEffect(() => {
    useApp.getState().load();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useApp.getState().setSwitcherOpen(!useApp.getState().switcherOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        useApp.getState().setTutorOpen(!useApp.getState().tutorOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        useApp.getState().addNote(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return <div className="grid h-full place-items-center text-muted">Opening your notes…</div>;

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {view === "review" ? (
          <ReviewView />
        ) : view === "graph" ? (
          <GraphView />
        ) : view === "planner" ? (
          <PlannerView />
        ) : view === "stats" ? (
          <StatsView />
        ) : view === "settings" ? (
          <SettingsView />
        ) : selectedNoteId ? <NoteView noteId={selectedNoteId} /> : <Empty />}
      </main>
      {tutorOpen && <TutorPanel />}
      {switcherOpen && <QuickSwitcher />}
    </div>
  );
}

function Empty() {
  const addSubject = useApp((s) => s.addSubject);
  const addNote = useApp((s) => s.addNote);
  const hasSubjects = useApp((s) => s.subjects.length > 0);
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 font-serif text-3xl font-bold">Welcome to Studih</h1>
        <p className="mb-6 text-muted">
          Start with a subject (like “Linear Algebra” or “Spanish”), then write your first note.
        </p>
        <div className="flex justify-center gap-2">
          {!hasSubjects && (
            <input
              placeholder="First subject, then Enter"
              className="rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
              onKeyDown={(e) => {
                const name = e.currentTarget.value.trim();
                if (e.key === "Enter" && name) addSubject(name);
              }}
            />
          )}
          <button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={() => addNote(null)}>
            New note <kbd className="ml-1 text-xs text-faint">Ctrl N</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
