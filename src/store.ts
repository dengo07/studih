import { create } from "zustand";
import * as repo from "./lib/repo";
import type { NoteMeta, Subject } from "./lib/repo";
import { dueCount } from "./lib/cardsRepo";

export type View = "notes" | "review" | "graph" | "planner" | "stats" | "settings";

export interface ReviewScope {
  subjectId?: string | null;
  noteId?: string;
}

interface AppState {
  ready: boolean;
  view: View;
  subjects: Subject[];
  notes: NoteMeta[];
  selectedNoteId: string | null;
  switcherOpen: boolean;
  tutorOpen: boolean;
  dueCount: number;
  reviewScope: ReviewScope;
  /** Card anchor (cloze/vocab row id) to scroll to once the open note renders. */
  pendingAnchor: string | null;

  load(): Promise<void>;
  setView(view: View): void;
  openNote(id: string | null, anchor?: string): void;
  startReview(scope?: ReviewScope): void;
  refreshDue(): Promise<void>;
  clearAnchor(): void;
  setSwitcherOpen(open: boolean): void;
  setTutorOpen(open: boolean): void;

  addSubject(name: string): Promise<void>;
  renameSubject(id: string, name: string): Promise<void>;
  removeSubject(id: string): Promise<void>;

  addNote(subjectId: string | null, title?: string): Promise<string>;
  /** Create a note without navigating to it (e.g. from a [[link]]). */
  createNoteQuiet(subjectId: string | null, title: string): Promise<string>;
  patchNote(id: string, patch: Partial<Pick<NoteMeta, "title" | "subject_id">>): Promise<void>;
  touchNote(id: string): void;
  removeNote(id: string): Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  view: "notes",
  subjects: [],
  notes: [],
  selectedNoteId: null,
  switcherOpen: false,
  tutorOpen: false,
  dueCount: 0,
  reviewScope: {},
  pendingAnchor: null,

  async load() {
    const [subjects, notes, due] = await Promise.all([repo.listSubjects(), repo.listNotes(), dueCount()]);
    set({ subjects, notes, dueCount: due, ready: true, selectedNoteId: get().selectedNoteId ?? notes[0]?.id ?? null });
  },

  setView: (view) => set({ view }),
  openNote: (id, anchor) => set({ selectedNoteId: id, view: "notes", switcherOpen: false, pendingAnchor: anchor ?? null }),
  startReview: (scope = {}) => set({ view: "review", reviewScope: scope, switcherOpen: false }),
  async refreshDue() {
    set({ dueCount: await dueCount() });
  },
  clearAnchor: () => set({ pendingAnchor: null }),
  setSwitcherOpen: (open) => set({ switcherOpen: open }),
  setTutorOpen: (open) => set({ tutorOpen: open }),

  async addSubject(name) {
    const subject = await repo.createSubject(name);
    set({ subjects: [...get().subjects, subject] });
  },
  async renameSubject(id, name) {
    await repo.renameSubject(id, name);
    set({ subjects: get().subjects.map((s) => (s.id === id ? { ...s, name } : s)) });
  },
  async removeSubject(id) {
    await repo.deleteSubject(id);
    set({
      subjects: get().subjects.filter((s) => s.id !== id),
      notes: get().notes.map((n) => (n.subject_id === id ? { ...n, subject_id: null } : n)),
    });
  },

  async addNote(subjectId, title = "") {
    const note = await repo.createNote(subjectId, title);
    set({ notes: [note, ...get().notes], selectedNoteId: note.id, view: "notes", switcherOpen: false });
    return note.id;
  },
  async createNoteQuiet(subjectId, title) {
    const note = await repo.createNote(subjectId, title);
    set({ notes: [note, ...get().notes] });
    return note.id;
  },
  async patchNote(id, patch) {
    await repo.updateNoteMeta(id, patch);
    set({
      notes: get().notes.map((n) => (n.id === id ? { ...n, ...patch, updated_at: Date.now() } : n)),
    });
  },
  touchNote(id) {
    set({ notes: get().notes.map((n) => (n.id === id ? { ...n, updated_at: Date.now() } : n)) });
  },
  async removeNote(id) {
    await repo.deleteNote(id);
    void get().refreshDue();
    const notes = get().notes.filter((n) => n.id !== id);
    set({
      notes,
      selectedNoteId: get().selectedNoteId === id ? (notes[0]?.id ?? null) : get().selectedNoteId,
    });
  },
}));
