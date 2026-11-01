import { useCallback, useEffect, useMemo, useState } from "react";
import { dueCards, reviewCard, type CardRow } from "../../lib/cardsRepo";
import { GRADES, Rating, formatInterval, previewIntervals, type Grade } from "../../lib/fsrs";
import RichText from "../../components/RichText";
import { useApp } from "../../store";

/** Cards that come due again within this window get re-queued in the same session ("Again" → 1 min). */
const REQUEUE_WINDOW_MS = 20 * 60_000;

export default function ReviewView() {
  const scope = useApp((s) => s.reviewScope);
  const subjects = useApp((s) => s.subjects);
  const notes = useApp((s) => s.notes);
  const { startReview, openNote, refreshDue } = useApp.getState();

  const [queue, setQueue] = useState<CardRow[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const card = queue?.[0];

  useEffect(() => {
    setQueue(null);
    setDone(0);
    setRevealed(false);
    dueCards({ subjectId: scope.subjectId, noteId: scope.noteId }).then(setQueue);
  }, [scope.subjectId, scope.noteId]);

  const intervals = useMemo(() => (card ? previewIntervals(card.fsrs_state_json) : null), [card]);

  const grade = useCallback(
    async (g: Grade) => {
      if (!card) return;
      const now = new Date();
      const { due, stateJson } = await reviewCard(card, g, now);
      setDone((d) => d + 1);
      setRevealed(false);
      setQueue((q) => {
        const rest = (q ?? []).slice(1);
        if (due - now.getTime() > REQUEUE_WINDOW_MS) return rest;
        return [...rest, { ...card, due_at: due, fsrs_state_json: stateJson }];
      });
      void refreshDue();
    },
    [card, refreshDue],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || (e.target as HTMLElement).closest("input, textarea, select")) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const g = GRADES.find((x) => x.key === e.key) ?? (e.key === " " ? GRADES[2] : undefined);
        if (g) {
          e.preventDefault();
          void grade(g.grade);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, grade]);

  const subject = subjects.find((s) => s.id === card?.subject_id);
  const scopeLabel = scope.noteId
    ? `Note: ${notes.find((n) => n.id === scope.noteId)?.title || "Untitled"}`
    : (subjects.find((s) => s.id === scope.subjectId)?.name ?? "All subjects");

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-8 pt-8 pb-10">

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <h1 className="mr-2 font-serif text-2xl font-bold">Review</h1>
        <ScopeChip active={!scope.subjectId && !scope.noteId} onClick={() => startReview({})}>
          All
        </ScopeChip>
        {subjects.map((s) => (
          <ScopeChip key={s.id} active={scope.subjectId === s.id} color={s.color} onClick={() => startReview({ subjectId: s.id })}>
            {s.name}
          </ScopeChip>
        ))}
        {scope.noteId && <ScopeChip active>{scopeLabel}</ScopeChip>}
        {queue && (
          <span className="ml-auto text-faint">
            {done} done · {queue.length} left
          </span>
        )}
      </div>

      {!queue ? (
        <p className="text-muted">Loading cards…</p>
      ) : !card ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <div className="mb-3 text-5xl">🎉</div>
            <h2 className="mb-1 text-xl font-semibold">{done ? `Nice — ${done} cards reviewed` : "Nothing due right now"}</h2>
            <p className="max-w-sm text-muted">
              {done
                ? "Come back later; cards return right before you'd forget them."
                : "Select text in any note and click “Quiz me” (Ctrl+Shift+C), or add a vocabulary table, to create cards."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-72 flex-col rounded-2xl border border-line bg-raised p-8 shadow-sm">
            <button
              className="mb-6 flex items-center gap-2 self-start text-xs text-faint hover:text-muted"
              onClick={() => openNote(card.note_id, card.anchor_id ?? undefined)}
              title="Open the note at this card"
            >
              <span className="size-2 rounded-full" style={{ background: subject?.color ?? "var(--faint)" }} />
              {card.note_title || "Untitled"} ↗
              <span className="rounded bg-hover px-1.5 py-0.5 tracking-wide uppercase">{card.kind}</span>
            </button>

            <div className="flex-1 text-xl leading-relaxed">
              {card.kind === "cloze" ? (
                <RichText text={card.front} answer={revealed ? card.back : undefined} />
              ) : (
                <>
                  <RichText text={card.front} className="text-2xl font-semibold" />
                  {revealed && (
                    <div className="mt-6 border-t border-line pt-6 whitespace-pre-line">
                      <RichText text={card.back} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-5 h-16">
            {!revealed ? (
              <button
                className="h-full w-full rounded-xl bg-accent text-base font-medium text-white hover:opacity-90"
                onClick={() => setRevealed(true)}
              >
                Show answer <kbd className="ml-2 text-xs opacity-70">Space</kbd>
              </button>
            ) : (
              <div className="grid h-full grid-cols-4 gap-2">
                {GRADES.map(({ grade: g, label, key }) => (
                  <button
                    key={g}
                    onClick={() => grade(g)}
                    className={`flex flex-col items-center justify-center rounded-xl border text-sm font-medium hover:opacity-90 ${GRADE_STYLE[g]}`}
                  >
                    {label}
                    <span className="text-xs font-normal opacity-70">
                      {intervals && formatInterval(intervals[g] - Date.now())} · {key}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const GRADE_STYLE: Record<Grade, string> = {
  [Rating.Again]: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  [Rating.Hard]: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  [Rating.Good]: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  [Rating.Easy]: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

function ScopeChip({ active, color, onClick, children }: { active: boolean; color?: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-0.5 ${active ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:bg-hover"}`}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
