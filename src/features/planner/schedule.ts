/** Exam study-plan generation. Pure functions over ISO dates (YYYY-MM-DD, local). */

export interface PlanTopic {
  id: string;
  /** 0 (easy / well known) … 1 (hard / unknown). */
  weight: number;
  /** The learn session is already done; only a review is still needed. */
  learned?: boolean;
}

export interface PlanExam {
  id: string;
  date: string;
  topics: PlanTopic[];
}

export interface PlannedSession {
  date: string;
  topicId: string;
  minutes: number;
  kind: "learn" | "review";
  /** True when the day was already full and this had to be squeezed in anyway. */
  overbooked: boolean;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toIso(dt);
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

interface Want {
  topicId: string;
  minutes: number;
  kind: "learn" | "review";
  target: string;
  deadline: string;
}

/**
 * Spread each unfinished topic over the days before its exam:
 * - a "learn" session, hardest topics first, across the first ~70% of the available days
 * - a shorter "review" session in the final stretch (spaced repetition before the exam)
 * Then fill days greedily up to `dailyMinutes`, sliding sessions later (never past the day
 * before the exam) when a day is full.
 */
export function planSchedule(opts: { today: string; exams: PlanExam[]; dailyMinutes: number }): PlannedSession[] {
  const wants: Want[] = [];

  for (const exam of opts.exams) {
    const span = daysBetween(opts.today, exam.date); // days available: today … exam-1
    if (span < 1 || !exam.topics.length) continue;
    const deadline = addDays(exam.date, -1);
    const topics = [...exam.topics].sort((a, b) => b.weight - a.weight);
    const learnDays = Math.max(1, Math.floor(span * 0.7));

    topics.forEach((t, i) => {
      const w = Math.min(1, Math.max(0, t.weight));
      const learnOffset = Math.floor((i * learnDays) / topics.length);
      if (!t.learned) {
        wants.push({ topicId: t.id, kind: "learn", minutes: round5(30 + 30 * w), target: addDays(opts.today, learnOffset), deadline });
      }
      if (span >= 2 || t.learned) {
        // review at least 2 days after learning when possible, inside the last 30%
        const reviewOffset = Math.min(span - 1, Math.max(learnOffset + 2, learnDays + Math.floor((i * (span - learnDays)) / topics.length)));
        wants.push({ topicId: t.id, kind: "review", minutes: round5(15 + 15 * w), target: addDays(opts.today, reviewOffset), deadline });
      }
    });
  }

  wants.sort((a, b) => (a.target === b.target ? (a.kind === b.kind ? 0 : a.kind === "learn" ? -1 : 1) : a.target < b.target ? -1 : 1));

  const load = new Map<string, number>();
  const out: PlannedSession[] = [];
  for (const w of wants) {
    let day = w.target;
    let placed = false;
    while (day <= w.deadline) {
      if ((load.get(day) ?? 0) + w.minutes <= opts.dailyMinutes) {
        placed = true;
        break;
      }
      day = addDays(day, 1);
    }
    if (!placed) day = w.target; // nothing free before the exam: keep the ideal day, flag it
    load.set(day, (load.get(day) ?? 0) + w.minutes);
    out.push({ date: day, topicId: w.topicId, minutes: w.minutes, kind: w.kind, overbooked: !placed });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
