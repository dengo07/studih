import { useEffect, useState } from "react";
import { searchNotes, type SearchHit } from "../lib/repo";
import { useApp } from "../store";

type Item = { kind: "note"; hit: SearchHit } | { kind: "create"; title: string };

/** Ctrl+K palette: full-text search over notes, or create a note from the query. */
export default function QuickSwitcher() {
  const notes = useApp((s) => s.notes);
  const subjects = useApp((s) => s.subjects);
  const { openNote, addNote, setSwitcherOpen } = useApp.getState();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setHits(notes.slice(0, 8).map((n) => ({ id: n.id, title: n.title, subject_id: n.subject_id, snippet: "" })));
    } else {
      searchNotes(query).then((h) => !cancelled && setHits(h));
    }
    setActive(0);
    return () => {
      cancelled = true;
    };
  }, [query, notes]);

  const items: Item[] = hits.map((hit) => ({ kind: "note" as const, hit }));
  if (query.trim()) items.push({ kind: "create", title: query.trim() });

  const choose = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === "note") openNote(item.hit.id);
    else addNote(null, item.title);
  };

  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]" onMouseDown={() => setSwitcherOpen(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-raised shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or create a note…"
          className="w-full border-b border-line bg-transparent px-4 py-3 outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter") choose(items[active]);
            if (e.key === "Escape") setSwitcherOpen(false);
          }}
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {items.map((item, i) => (
            <li
              key={item.kind === "note" ? item.hit.id : "create"}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(item)}
              className={`cursor-pointer px-4 py-2 ${i === active ? "bg-accent-soft" : ""}`}
            >
              {item.kind === "note" ? (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="size-2 rounded-full" style={{ background: subjectOf(item.hit.subject_id)?.color ?? "var(--faint)" }} />
                    <span className="font-medium">{item.hit.title || "Untitled"}</span>
                    <span className="text-xs text-faint">{subjectOf(item.hit.subject_id)?.name}</span>
                  </div>
                  {item.hit.snippet && (
                    // snippet() only injects <mark>; note text itself is escaped below
                    <div className="mt-0.5 truncate text-xs text-muted" dangerouslySetInnerHTML={{ __html: safeSnippet(item.hit.snippet) }} />
                  )}
                </>
              ) : (
                <div className="text-sm text-muted">
                  + Create note <span className="font-medium text-fg">“{item.title}”</span>
                </div>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-faint">No notes yet</li>}
        </ul>
      </div>
    </div>
  );
}

/** Escape everything, then restore only the <mark> tags FTS5 snippet() inserted. */
function safeSnippet(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}
