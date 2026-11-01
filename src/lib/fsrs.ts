import { createEmptyCard, fsrs, Rating, type Card, type CardInput, type Grade } from "ts-fsrs";

export { Rating };
export type { Grade };

const scheduler = fsrs({ enable_fuzz: true });

export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: Rating.Again, label: "Again", key: "1" },
  { grade: Rating.Hard, label: "Hard", key: "2" },
  { grade: Rating.Good, label: "Good", key: "3" },
  { grade: Rating.Easy, label: "Easy", key: "4" },
];

export function newCardState(now = new Date()): Card {
  return createEmptyCard(now);
}

/** Card state round-trips through JSON (dates become strings), which ts-fsrs accepts as CardInput. */
export function parseState(json: string | null, now = new Date()): CardInput | Card {
  return json ? (JSON.parse(json) as CardInput) : newCardState(now);
}

export function schedule(stateJson: string | null, grade: Grade, now = new Date()) {
  const { card } = scheduler.next(parseState(stateJson, now), now, grade);
  return { state: card, due: card.due.getTime() };
}

/** Due date for every grade, for the "Good · 3d" hints under the buttons. */
export function previewIntervals(stateJson: string | null, now = new Date()): Record<Grade, number> {
  const preview = scheduler.repeat(parseState(stateJson, now), now);
  return Object.fromEntries(GRADES.map(({ grade }) => [grade, preview[grade].card.due.getTime()])) as Record<Grade, number>;
}

export function formatInterval(ms: number) {
  const min = ms / 60_000;
  if (min < 1) return "<1m";
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
