import { useEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import Editor, { type EditorChange } from "../../editor/Editor";
import { getNote, saveNoteContent, setLinks, type Note } from "../../lib/repo";
import { extractLinks } from "../../editor/extensions/WikiLink";
import Backlinks from "./Backlinks";
import { extractCards } from "../../editor/cards";
import { cardsForNote, syncNoteCards } from "../../lib/cardsRepo";
import { useApp } from "../../store";

const SAVE_DELAY_MS = 600;

export default function NoteView({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [status, setStatus] = useState<"saved" | "saving">("saved");
  const [cardStats, setCardStats] = useState({ total: 0, due: 0 });
  const [quiz, setQuiz] = useState(false);
  const subjects = useApp((s) => s.subjects);
  const meta = useApp((s) => s.notes.find((n) => n.id === noteId));
  const pendingAnchor = useApp((s) => s.pendingAnchor);
  const { patchNote, touchNote, removeNote, refreshDue, startReview, clearAnchor } = useApp.getState();

  const editorRef = useRef<TiptapEditor | null>(null);
  const pending = useRef<EditorChange | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = async () => {
    window.clearTimeout(timer.current);
    const change = pending.current;
    if (!change) return;
    pending.current = null;
    if (!useApp.getState().notes.some((n) => n.id === noteId)) return; // deleted meanwhile
    await saveNoteContent(noteId, change.docJson, change.plainText);
    const doc = JSON.parse(change.docJson);
    await syncNoteCards(noteId, extractCards(doc));
    await setLinks(noteId, extractLinks(doc));
    touchNote(noteId);
    setStatus("saved");
    void loadCardStats();
    void refreshDue();
  };

  const loadCardStats = async () => {
    const cards = await cardsForNote(noteId);
    const now = Date.now();
    setCardStats({ total: cards.length, due: cards.filter((c) => c.due_at <= now).length });
  };

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setQuiz(false);
    getNote(noteId).then((n) => !cancelled && setNote(n));
    void loadCardStats();
    return () => {
      cancelled = true;
      void flush();
    };
  }, [noteId]);

  // jump to a card's source (from the review screen) once the editor has rendered
  useEffect(() => {
    if (!note || !pendingAnchor) return;
    const id = window.setTimeout(() => {
      const el = document.querySelector(`[data-cloze="${pendingAnchor}"], [data-anchor="${pendingAnchor}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.classList.add("flash");
      window.setTimeout(() => el?.classList.remove("flash"), 1800);
      clearAnchor();
    }, 80);
    return () => window.clearTimeout(id);
  }, [note, pendingAnchor, clearAnchor]);

  useEffect(() => {
    editorRef.current?.setEditable(!quiz);
    if (!quiz) document.querySelectorAll(".cloze.revealed").forEach((el) => el.classList.remove("revealed"));
  }, [quiz]);

  const onChange = (change: EditorChange) => {
    pending.current = change;
    setStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  if (!note || !meta) return <div className="p-10 text-muted">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-10 pt-10">
      <div className="mb-2 flex items-center gap-3 text-sm whitespace-nowrap text-muted">
        <select
          className="rounded-md bg-transparent px-1 py-0.5 hover:bg-hover"
          value={meta.subject_id ?? ""}
          onChange={(e) => patchNote(noteId, { subject_id: e.target.value || null })}
        >
          <option value="">No subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-faint">{status === "saving" ? "Saving…" : "Saved"}</span>
        <div className="ml-auto flex items-center gap-1">
          {cardStats.total > 0 && (
            <button
              className="rounded-md px-2 py-0.5 hover:bg-hover"
              title="Review this note's cards"
              onClick={() => startReview({ noteId })}
            >
              {cardStats.total} cards{cardStats.due > 0 && <span className="text-accent"> · {cardStats.due} due</span>}
            </button>
          )}
          <button
            className={`rounded-md px-2 py-0.5 ${quiz ? "bg-accent text-white" : "hover:bg-hover"}`}
            title="Hide your quiz parts and vocab translations; click one to reveal it"
            onClick={() => setQuiz(!quiz)}
          >
            {quiz ? "Exit quiz mode" : "Quiz mode"}
          </button>
        </div>
        <button
          className="rounded-md px-2 py-0.5 text-faint hover:bg-hover hover:text-red-500"
          onClick={() => {
            if (confirm(`Delete “${meta.title || "Untitled"}”? This can't be undone.`)) removeNote(noteId);
          }}
        >
          Delete
        </button>
      </div>

      <input
        className="mb-4 w-full bg-transparent font-serif text-4xl font-bold outline-none placeholder:text-faint"
        placeholder="Untitled"
        value={meta.title}
        onChange={(e) => patchNote(noteId, { title: e.target.value })}
        autoFocus={!meta.title}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            editorRef.current?.commands.focus("start");
          }
        }}
      />

      <div
        className={quiz ? "quiz" : undefined}
        onClick={(e) => {
          if (!quiz) return;
          (e.target as HTMLElement).closest(".cloze")?.classList.toggle("revealed");
        }}
      >
        <Editor
          key={noteId}
          initialDoc={JSON.parse(note.doc_json)}
          onChange={onChange}
          editorRef={editorRef}
          context={{ noteId, title: meta.title, subject: subjects.find((s) => s.id === meta.subject_id)?.name }}
        />
      </div>

      <Backlinks noteId={noteId} />
    </div>
  );
}
