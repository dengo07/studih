import { useEffect, useState } from "react";
import { backlinks } from "../../lib/repo";
import { useApp } from "../../store";

type Row = Awaited<ReturnType<typeof backlinks>>[number];

/** "Linked from" list under a note. Refreshes whenever any note is saved. */
export default function Backlinks({ noteId }: { noteId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const lastEdit = useApp((s) => s.notes.reduce((m, n) => Math.max(m, n.updated_at), 0));
  const subjects = useApp((s) => s.subjects);
  const openNote = useApp((s) => s.openNote);

  useEffect(() => {
    let cancelled = false;
    backlinks(noteId).then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [noteId, lastEdit]);

  if (!rows.length) return null;

  return (
    <section className="mt-4 mb-24 border-t border-line pt-5">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-faint uppercase">
        Linked from {rows.length} {rows.length === 1 ? "note" : "notes"}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => openNote(r.id)}
            className="rounded-lg border border-line bg-raised p-3 text-left hover:border-faint"
          >
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <span className="size-2 rounded-full" style={{ background: subjects.find((s) => s.id === r.subject_id)?.color ?? "var(--faint)" }} />
              {r.title || "Untitled"}
            </div>
            <div className="line-clamp-2 text-xs text-muted">{r.snippet}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
