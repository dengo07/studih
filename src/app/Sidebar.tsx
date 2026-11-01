import { useState } from "react";
import { useApp } from "../store";
import type { NoteMeta, Subject } from "../lib/repo";
import FocusTimer from "../features/focus/FocusTimer";

export default function Sidebar() {
  const subjects = useApp((s) => s.subjects);
  const notes = useApp((s) => s.notes);
  const view = useApp((s) => s.view);
  const due = useApp((s) => s.dueCount);
  const tutorOpen = useApp((s) => s.tutorOpen);
  const { addSubject, setSwitcherOpen, startReview, setView, setTutorOpen } = useApp.getState();
  const [adding, setAdding] = useState(false);

  const loose = notes.filter((n) => !n.subject_id || !subjects.some((s) => s.id === n.subject_id));

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="grid size-7 place-items-center rounded-lg bg-accent text-sm font-bold text-white">S</div>
        <span className="font-semibold tracking-tight">Studih</span>
      </div>

      <button
        onClick={() => setSwitcherOpen(true)}
        className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-left text-sm text-muted hover:border-faint"
      >
        <span>Search notes…</span>
        <kbd className="ml-auto rounded border border-line px-1 text-[11px] text-faint">Ctrl K</kbd>
      </button>

      <FocusTimer />

      <nav className="mb-2 px-2">
        <NavItem active={view === "review"} onClick={() => startReview({})} icon="◎" label="Review">
          {due > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{due}</span>}
        </NavItem>
        <NavItem active={view === "planner"} onClick={() => setView("planner")} icon="▦" label="Planner" />
        <NavItem active={view === "graph"} onClick={() => setView("graph")} icon="✳" label="Graph" />
        <NavItem active={view === "stats"} onClick={() => setView("stats")} icon="◔" label="Stats" />
        <NavItem active={tutorOpen} onClick={() => setTutorOpen(!tutorOpen)} icon="✦" label="Tutor">
          <kbd className="ml-auto text-[11px] text-faint">Ctrl J</kbd>
        </NavItem>
      </nav>

      <div className="flex-1 overflow-y-auto border-t border-line px-2 pb-4">
        {subjects.map((s) => (
          <SubjectGroup key={s.id} subject={s} notes={notes.filter((n) => n.subject_id === s.id)} />
        ))}
        {loose.length > 0 && <SubjectGroup subject={null} notes={loose} />}

        {adding ? (
          <input
            autoFocus
            placeholder="Subject name"
            className="mt-2 w-full rounded-md border border-line bg-raised px-2 py-1 text-sm outline-none focus:border-accent"
            onBlur={() => setAdding(false)}
            onKeyDown={(e) => {
              const name = e.currentTarget.value.trim();
              if (e.key === "Enter" && name) {
                addSubject(name);
                setAdding(false);
              }
              if (e.key === "Escape") setAdding(false);
            }}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 w-full rounded-md px-2 py-1 text-left text-sm text-faint hover:bg-hover hover:text-muted"
          >
            + New subject
          </button>
        )}
      </div>
      <div className="border-t border-line p-2">
        <NavItem active={view === "settings"} onClick={() => setView("settings")} icon="⚙" label="Settings" />
      </div>
    </aside>
  );
}

function NavItem({ active, onClick, icon, label, children }: { active: boolean; onClick(): void; icon: string; label: string; children?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg"}`}
    >
      <span className="w-4 text-center text-faint">{icon}</span>
      {label}
      {children}
    </button>
  );
}

function SubjectGroup({ subject, notes }: { subject: Subject | null; notes: NoteMeta[] }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const selectedNoteId = useApp((s) => (s.view === "notes" ? s.selectedNoteId : null));
  const { addNote, openNote, renameSubject, removeSubject } = useApp.getState();
  const sorted = [...notes].sort((a, b) => (a.title || "~").localeCompare(b.title || "~"));

  return (
    <div className="mt-1">
      <div className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold tracking-wide text-muted uppercase hover:bg-hover">
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <span className={`text-[9px] text-faint transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          <span className="size-2 shrink-0 rounded-full" style={{ background: subject?.color ?? "var(--faint)" }} />
          {editing && subject ? (
            <input
              autoFocus
              defaultValue={subject.name}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded bg-raised px-1 font-normal normal-case outline-none"
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                const name = e.currentTarget.value.trim();
                if (e.key === "Enter" && name) {
                  renameSubject(subject.id, name);
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <span className="truncate" onDoubleClick={() => setEditing(true)}>
              {subject?.name ?? "Unsorted"}
            </span>
          )}
        </button>
        {subject && (
          <button
            title="Delete subject (notes are kept)"
            onClick={() => confirm(`Delete subject “${subject.name}”? Its notes move to Unsorted.`) && removeSubject(subject.id)}
            className="hidden px-1 text-faint group-hover:block hover:text-red-500"
          >
            ×
          </button>
        )}
        <button
          title="New note"
          onClick={() => addNote(subject?.id ?? null)}
          className="hidden px-1 text-sm text-faint group-hover:block hover:text-fg"
        >
          +
        </button>
      </div>

      {open &&
        sorted.map((n) => (
          <button
            key={n.id}
            onClick={() => openNote(n.id)}
            className={`block w-full truncate rounded-md py-1 pr-2 pl-7 text-left text-sm ${
              n.id === selectedNoteId ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg"
            }`}
          >
            {n.title || <span className="text-faint italic">Untitled</span>}
          </button>
        ))}
    </div>
  );
}
