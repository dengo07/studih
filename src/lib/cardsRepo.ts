import { getDb } from "./db";
import { newId } from "./repo";
import { schedule, type Grade } from "./fsrs";
import type { ExtractedCard } from "../editor/cards";

export interface CardRow {
  id: string;
  note_id: string;
  kind: "cloze" | "vocab" | "ai";
  front: string;
  back: string;
  anchor_id: string | null;
  fsrs_state_json: string | null;
  due_at: number;
  note_title: string;
  subject_id: string | null;
}

/**
 * Make the note's derived cards match `cards`: insert new anchors (due now), refresh text of
 * existing ones while keeping their review history, and drop cards whose anchor is gone.
 */
export async function syncNoteCards(noteId: string, cards: ExtractedCard[], now = Date.now()) {
  const db = await getDb();
  const existing = await db.select<{ id: string; anchor_id: string }>(
    "SELECT id, anchor_id FROM cards WHERE note_id = ? AND kind IN ('cloze', 'vocab')",
    [noteId],
  );
  const keep = new Set(cards.map((c) => c.anchorId));
  for (const row of existing) {
    if (!keep.has(row.anchor_id)) await db.execute("DELETE FROM cards WHERE id = ?", [row.id]);
  }
  for (const c of cards) {
    await db.execute(
      `INSERT INTO cards (id, note_id, kind, front, back, anchor_id, fsrs_state_json, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(anchor_id) WHERE anchor_id IS NOT NULL
       DO UPDATE SET front = excluded.front, back = excluded.back, note_id = excluded.note_id, kind = excluded.kind`,
      [newId(), noteId, c.kind, c.front, c.back, c.anchorId, now, now],
    );
  }
}

export async function addFreeCards(noteId: string, cards: { front: string; back: string }[], now = Date.now()) {
  const db = await getDb();
  for (const c of cards) {
    await db.execute(
      `INSERT INTO cards (id, note_id, kind, front, back, anchor_id, fsrs_state_json, due_at, created_at)
       VALUES (?, ?, 'ai', ?, ?, NULL, NULL, ?, ?)`,
      [newId(), noteId, c.front, c.back, now, now],
    );
  }
}

const CARD_SELECT = `SELECT c.*, n.title AS note_title, n.subject_id
  FROM cards c JOIN notes n ON n.id = c.note_id`;

export async function dueCards(opts: { now?: number; subjectId?: string | null; noteId?: string; limit?: number } = {}) {
  const db = await getDb();
  const where = ["c.due_at <= ?"];
  const params: unknown[] = [opts.now ?? Date.now()];
  if (opts.subjectId) (where.push("n.subject_id = ?"), params.push(opts.subjectId));
  if (opts.noteId) (where.push("c.note_id = ?"), params.push(opts.noteId));
  params.push(opts.limit ?? 200);
  return db.select<CardRow>(`${CARD_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.due_at LIMIT ?`, params);
}

export async function dueCount(now = Date.now()) {
  const db = await getDb();
  const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM cards WHERE due_at <= ?", [now]);
  return n;
}

export async function cardsForNote(noteId: string) {
  const db = await getDb();
  return db.select<CardRow>(`${CARD_SELECT} WHERE c.note_id = ? ORDER BY c.created_at`, [noteId]);
}

export async function reviewCard(card: Pick<CardRow, "id" | "fsrs_state_json">, grade: Grade, now = new Date()) {
  const db = await getDb();
  const { state, due } = schedule(card.fsrs_state_json, grade, now);
  const stateJson = JSON.stringify(state);
  await db.execute("UPDATE cards SET fsrs_state_json = ?, due_at = ? WHERE id = ?", [stateJson, due, card.id]);
  await db.execute("INSERT INTO reviews (id, card_id, rating, reviewed_at) VALUES (?, ?, ?, ?)", [
    newId(), card.id, grade, now.getTime(),
  ]);
  return { due, stateJson };
}

export async function deleteCard(id: string) {
  const db = await getDb();
  await db.execute("DELETE FROM cards WHERE id = ?", [id]);
}
