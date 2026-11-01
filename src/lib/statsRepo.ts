import { getDb } from "./db";
import { graphData, mastery } from "./repo";
import { addDays, toIso } from "../features/planner/schedule";

export interface DayValue {
  date: string;
  value: number;
  /** Per-subject breakdown for tooltips (focus only). */
  parts?: { subjectId: string | null; value: number }[];
}

export function lastDays(n: number, today = toIso(new Date())): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/** Consecutive days with any study activity, ending today (or yesterday, if today is still empty). */
export function streak(activeDays: Set<string>, today = toIso(new Date())): number {
  let day = activeDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (activeDays.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export async function loadStats(days = 14) {
  const db = await getDb();
  const range = lastDays(days);
  const since = new Date(`${range[0]}T00:00`).getTime();
  const yearAgo = Date.now() - 366 * 86_400_000;

  const [focus, reviews, activity, retention, graph] = await Promise.all([
    db.select<{ subject_id: string | null; started_at: number; minutes: number }>(
      "SELECT subject_id, started_at, minutes FROM focus_sessions WHERE kind = 'focus' AND started_at >= ?",
      [since],
    ),
    db.select<{ reviewed_at: number }>("SELECT reviewed_at FROM reviews WHERE reviewed_at >= ?", [since]),
    db.select<{ t: number }>(
      `SELECT started_at AS t FROM focus_sessions WHERE kind = 'focus' AND minutes >= 1 AND started_at >= ?
       UNION ALL SELECT reviewed_at FROM reviews WHERE reviewed_at >= ?`,
      [yearAgo, yearAgo],
    ),
    db.select<{ total: number; passed: number }>(
      "SELECT COUNT(*) AS total, COALESCE(SUM(rating > 1), 0) AS passed FROM reviews WHERE reviewed_at >= ?",
      [Date.now() - 30 * 86_400_000],
    ),
    graphData(),
  ]);

  const day = (t: number) => toIso(new Date(t));

  const focusByDay: DayValue[] = range.map((date) => {
    const rows = focus.filter((f) => day(f.started_at) === date);
    const bySubject = new Map<string | null, number>();
    for (const r of rows) bySubject.set(r.subject_id, (bySubject.get(r.subject_id) ?? 0) + r.minutes);
    return {
      date,
      value: Math.round(rows.reduce((m, r) => m + r.minutes, 0)),
      parts: [...bySubject.entries()].map(([subjectId, value]) => ({ subjectId, value: Math.round(value) })),
    };
  });

  const reviewsByDay: DayValue[] = range.map((date) => ({ date, value: reviews.filter((r) => day(r.reviewed_at) === date).length }));

  const subjectTotals = new Map<string | null, number>();
  for (const f of focus.filter((f) => f.started_at >= Date.now() - 7 * 86_400_000)) {
    subjectTotals.set(f.subject_id, (subjectTotals.get(f.subject_id) ?? 0) + f.minutes);
  }

  const weakest = graph.nodes
    .map((n) => ({ id: n.id, title: n.title, subject_id: n.subject_id, cards: n.cards, mastery: mastery(n) }))
    .filter((n): n is typeof n & { mastery: number } => n.mastery !== null)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 5);

  return {
    focusByDay,
    reviewsByDay,
    focusToday: focusByDay[focusByDay.length - 1].value,
    focusWeek: Math.round(focusByDay.slice(-7).reduce((m, d) => m + d.value, 0)),
    streak: streak(new Set(activity.map((a) => day(a.t)))),
    retention: retention[0].total ? retention[0].passed / retention[0].total : null,
    reviews30: retention[0].total,
    subjectWeek: [...subjectTotals.entries()]
      .map(([subjectId, minutes]) => ({ subjectId, minutes: Math.round(minutes) }))
      .sort((a, b) => b.minutes - a.minutes),
    weakest,
  };
}

export type Stats = Awaited<ReturnType<typeof loadStats>>;
