import { useCallback, useEffect, useMemo, useState } from "react";
import * as planner from "../../lib/plannerRepo";
import type { Exam, PlanRow, Topic } from "../../lib/plannerRepo";
import { getSetting } from "../../lib/settings";
import { fuzzyFilter } from "../../lib/fuzzy";
import { useApp } from "../../store";
import { useFocus } from "../focus/focusStore";
import { addDays, daysBetween } from "./schedule";

const weekday = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function PlannerView() {
  const subjects = useApp((s) => s.subjects);
  const dueCount = useApp((s) => s.dueCount);
  const { openNote, startReview } = useApp.getState();
  const startFocus = useFocus((s) => s.start);

  const [exams, setExams] = useState<Exam[]>([]);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [missed, setMissed] = useState(0);
  const [budget, setBudget] = useState(120);
  const [busy, setBusy] = useState(false);
  const today = planner.today();

  const reload = useCallback(async () => {
    const [e, p, m, b] = await Promise.all([
      planner.listExams(),
      planner.planFor(today, addDays(today, 7)),
      planner.missedCount(),
      getSetting("planner.dailyMinutes"),
    ]);
    setExams(e);
    setPlan(p);
    setMissed(m);
    setBudget(Number(b) > 0 ? Number(b) : 120);
  }, [today]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const regenerate = async () => {
    setBusy(true);
    await planner.regeneratePlan(budget);
    await reload();
    setBusy(false);
  };

  const todays = plan.filter((p) => p.date === today);
  const upcoming = useMemo(() => {
    const byDay = new Map<string, PlanRow[]>();
    for (const p of plan.filter((p) => p.date > today)) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
    return [...byDay.entries()];
  }, [plan, today]);
  const color = (sid: string | null) => subjects.find((s) => s.id === sid)?.color ?? "var(--faint)";
  const todayMinutes = todays.reduce((m, p) => m + (p.done ? 0 : p.minutes), 0);
  const upcomingExams = exams.filter((e) => e.date >= today);

  return (
    <div className="mx-auto max-w-4xl px-10 pt-10 pb-20">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl font-bold">Planner</h1>
        <span className="text-sm text-faint">up to {budget} min/day · change in Settings</span>
        <button className="ai-primary ml-auto" disabled={busy || !upcomingExams.length} onClick={regenerate}>
          {busy ? "Planning…" : plan.length ? "Re-plan" : "Generate plan"}
        </button>
      </div>

      {missed > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <span>
            You missed <b>{missed}</b> planned {missed === 1 ? "session" : "sessions"}. No stress, let's spread them over the days left.
          </span>
          <button className="ai-primary ml-auto" onClick={regenerate}>
            Rebalance
          </button>
        </div>
      )}

      <section className="mb-8 rounded-2xl border border-line bg-raised p-5">
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">Today</h2>
          <span className="text-sm text-faint">{weekday(today)}</span>
          {todayMinutes > 0 && <span className="text-sm text-muted">· {todayMinutes} min left</span>}
          {dueCount > 0 && (
            <button className="ml-auto text-sm text-accent hover:underline" onClick={() => startReview({})}>
              {dueCount} cards due →
            </button>
          )}
        </div>
        {todays.length === 0 ? (
          <p className="text-sm text-muted">
            {upcomingExams.length ? "Nothing planned for today. Generate a plan, or enjoy the day off." : "Add an exam below and Studih will plan your study days."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {todays.map((p) => (
              <PlanItem
                key={p.id}
                item={p}
                color={color(p.subject_id)}
                onToggle={async () => {
                  await planner.setPlanItemDone(p.id, !p.done);
                  await reload();
                }}
                onOpen={p.note_id ? () => openNote(p.note_id!) : undefined}
                onFocus={() => startFocus(p.subject_id)}
              />
            ))}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-faint uppercase">Next 7 days</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map(([date, items]) => (
              <div key={date} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex justify-between text-xs text-muted">
                  <span className="font-semibold">{weekday(date)}</span>
                  <span>{items.reduce((m, p) => m + p.minutes, 0)} min</span>
                </div>
                {items.map((p) => (
                  <div key={p.id} className={`flex items-center gap-2 py-0.5 text-sm ${p.done ? "text-faint line-through" : ""}`}>
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: color(p.subject_id) }} />
                    <span className="truncate">{p.topic_title}</span>
                    <span className="ml-auto shrink-0 text-xs text-faint">{p.kind === "review" ? "review" : `${p.minutes}m`}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-faint uppercase">Exams</h2>
        <div className="flex flex-col gap-3">
          {exams.map((e) => (
            <ExamCard key={e.id} exam={e} color={color(e.subject_id)} subjectName={subjects.find((s) => s.id === e.subject_id)?.name} onChange={reload} />
          ))}
          <AddExam onAdded={reload} />
        </div>
      </section>
    </div>
  );
}

function PlanItem({ item, color, onToggle, onOpen, onFocus }: { item: PlanRow; color: string; onToggle(): void; onOpen?: () => void; onFocus(): void }) {
  const days = daysBetween(planner.today(), item.exam_date);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <input type="checkbox" checked={!!item.done} onChange={onToggle} className="size-4 accent-[var(--accent)]" />
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <div className={`min-w-0 flex-1 ${item.done ? "text-faint line-through" : ""}`}>
        <div className="truncate font-medium">{item.topic_title}</div>
        <div className="text-xs text-faint">
          {item.kind === "review" ? "Review" : "Learn"} · {item.minutes} min · {item.exam_title} in {days} {days === 1 ? "day" : "days"}
        </div>
      </div>
      {onOpen && (
        <button className="ai-ghost" onClick={onOpen}>
          Open note
        </button>
      )}
      {!item.done && (
        <button className="ai-ghost" onClick={onFocus} title="Start a focus session for this subject">
          ▶ Focus
        </button>
      )}
    </li>
  );
}

function ExamCard({ exam, color, subjectName, onChange }: { exam: Exam; color: string; subjectName?: string; onChange(): void }) {
  const notes = useApp((s) => s.notes);
  const openNote = useApp((s) => s.openNote);
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [draft, setDraft] = useState("");
  const days = daysBetween(planner.today(), exam.date);
  const pct = exam.topics ? Math.round((exam.done_topics / exam.topics) * 100) : 0;

  const loadTopics = useCallback(() => planner.listTopics(exam.id).then(setTopics), [exam.id]);
  useEffect(() => {
    if (open) void loadTopics();
  }, [open, loadTopics]);

  const suggestions = draft.trim() ? fuzzyFilter(notes.filter((n) => !topics.some((t) => t.note_id === n.id)), draft, (n) => n.title, 5) : [];
  const refresh = async () => {
    await loadTopics();
    onChange();
  };

  return (
    <div className="rounded-xl border border-line bg-raised">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)}>
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{exam.title}</div>
          <div className="text-xs text-faint">
            {subjectName && `${subjectName} · `}
            {weekday(exam.date)} · {days < 0 ? "done" : days === 0 ? "today!" : `in ${days} ${days === 1 ? "day" : "days"}`}
          </div>
        </div>
        <div className="w-32">
          <div className="mb-1 text-right text-xs text-muted">
            {exam.done_topics}/{exam.topics} topics
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-hover">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </div>
        </div>
        <span className={`text-xs text-faint transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
      </button>

      {open && (
        <div className="border-t border-line px-4 py-3">
          <ul className="mb-3">
            {topics.map((t) => (
              <li key={t.id} className="group flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={!!t.done}
                  className="accent-[var(--accent)]"
                  onChange={async () => {
                    await planner.setTopicDone(t.id, !t.done);
                    await refresh();
                  }}
                />
                <span className={t.done ? "text-faint line-through" : ""}>{t.title}</span>
                {t.note_id && (
                  <button className="text-xs text-accent hover:underline" onClick={() => openNote(t.note_id!)}>
                    note
                  </button>
                )}
                <button
                  className="ml-auto hidden text-faint group-hover:block hover:text-red-500"
                  onClick={async () => {
                    await planner.deleteTopic(t.id);
                    await refresh();
                  }}
                >
                  ×
                </button>
              </li>
            ))}
            {!topics.length && <li className="text-sm text-faint">No topics yet.</li>}
          </ul>

          <div className="relative flex flex-wrap items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && draft.trim()) {
                  await planner.addTopic(exam.id, draft.trim());
                  setDraft("");
                  await refresh();
                }
              }}
              placeholder="Add a topic, or type to link a note…"
              className="min-w-60 flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            {exam.subject_id && (
              <button
                className="ai-ghost"
                onClick={async () => {
                  await planner.addTopicsFromSubject(exam.id, exam.subject_id!);
                  await refresh();
                }}
              >
                + All notes from {subjectName}
              </button>
            )}
            <button
              className="ai-ghost text-red-500"
              onClick={async () => {
                if (!confirm(`Delete exam “${exam.title}” and its plan?`)) return;
                await planner.deleteExam(exam.id);
                onChange();
              }}
            >
              Delete exam
            </button>
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 z-10 mt-1 w-72 rounded-lg border border-line bg-raised p-1 shadow-xl">
                {suggestions.map((n) => (
                  <button
                    key={n.id}
                    className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-hover"
                    onClick={async () => {
                      await planner.addTopic(exam.id, n.title || "Untitled", n.id);
                      setDraft("");
                      await refresh();
                    }}
                  >
                    📄 {n.title || "Untitled"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddExam({ onAdded }: { onAdded(): void }) {
  const subjects = useApp((s) => s.subjects);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState(addDays(planner.today(), 14));

  const submit = async () => {
    if (!title.trim() || !date) return;
    await planner.createExam(subjectId || null, title.trim(), date);
    setTitle("");
    onAdded();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="New exam, e.g. Calculus midterm"
        className="min-w-52 flex-1 rounded-lg border border-line bg-raised px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="rounded-lg border border-line bg-raised px-2 py-1.5 text-sm">
        <option value="">Subject…</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        min={addDays(planner.today(), 1)}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-line bg-raised px-2 py-1.5 text-sm"
      />
      <button className="ai-primary" disabled={!title.trim()} onClick={submit}>
        Add exam
      </button>
    </div>
  );
}
