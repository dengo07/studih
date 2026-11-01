import { getDb } from "./db";

export const newId = () => crypto.randomUUID();

export interface Subject {
  id: string;
  name: string;
  color: string;
}

export interface NoteMeta {
  id: string;
  subject_id: string | null;
  title: string;
  updated_at: number;
}

export interface Note extends NoteMeta {
  doc_json: string;
  plain_text: string;
  created_at: number;
}

export interface SearchHit {
  id: string;
  title: string;
  subject_id: string | null;
  snippet: string;
}

/**
 * Subject identity colors, assigned in this fixed order. Validated (lightness band, CVD and
 * normal-vision separation, contrast) against both the light and dark surfaces.
 */
export const SUBJECT_COLORS = [
  "#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767",
];

// ---- subjects ----

export async function listSubjects(): Promise<Subject[]> {
  const db = await getDb();
  return db.select<Subject>("SELECT id, name, color FROM subjects ORDER BY created_at");
}

export async function createSubject(name: string): Promise<Subject> {
  const db = await getDb();
  const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM subjects");
  const subject = { id: newId(), name, color: SUBJECT_COLORS[n % SUBJECT_COLORS.length] };
  await db.execute("INSERT INTO subjects (id, name, color, created_at) VALUES (?, ?, ?, ?)", [
    subject.id, subject.name, subject.color, Date.now(),
  ]);
  return subject;
}

export async function renameSubject(id: string, name: string) {
  const db = await getDb();
  await db.execute("UPDATE subjects SET name = ? WHERE id = ?", [name, id]);
}

export async function deleteSubject(id: string) {
  const db = await getDb();
  await db.execute("DELETE FROM subjects WHERE id = ?", [id]);
}

// ---- notes ----

export async function listNotes(): Promise<NoteMeta[]> {
  const db = await getDb();
  return db.select<NoteMeta>(
    "SELECT id, subject_id, title, updated_at FROM notes ORDER BY updated_at DESC",
  );
}

export async function getNote(id: string): Promise<Note | null> {
  const db = await getDb();
  const rows = await db.select<Note>("SELECT * FROM notes WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function createNote(subjectId: string | null, title = ""): Promise<NoteMeta> {
  const db = await getDb();
  const now = Date.now();
  const note = { id: newId(), subject_id: subjectId, title, updated_at: now };
  await db.execute(
    "INSERT INTO notes (id, subject_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [note.id, subjectId, title, now, now],
  );
  return note;
}

export async function saveNoteContent(id: string, docJson: string, plainText: string) {
  const db = await getDb();
  await db.execute("UPDATE notes SET doc_json = ?, plain_text = ?, updated_at = ? WHERE id = ?", [
    docJson, plainText, Date.now(), id,
  ]);
}

export async function updateNoteMeta(id: string, patch: { title?: string; subject_id?: string | null }) {
  const db = await getDb();
  if (patch.title !== undefined) {
    await db.execute("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?", [patch.title, Date.now(), id]);
  }
  if (patch.subject_id !== undefined) {
    await db.execute("UPDATE notes SET subject_id = ? WHERE id = ?", [patch.subject_id, id]);
  }
}

export async function deleteNote(id: string) {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id = ?", [id]);
}

/** Turn free text into a safe FTS5 prefix query: `foo ba` -> `"foo"* "ba"*`. */
export function toFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((t) => t.replace(/"/g, ""))
    .filter(Boolean)
    .map((t) => `"${t}"*`)
    .join(" ");
}

export async function searchNotes(query: string, limit = 20): Promise<SearchHit[]> {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  const db = await getDb();
  return db.select<SearchHit>(
    `SELECT n.id, n.title, n.subject_id,
            snippet(notes_fts, 2, '<mark>', '</mark>', '…', 10) AS snippet
       FROM notes_fts JOIN notes n ON n.id = notes_fts.note_id
      WHERE notes_fts MATCH ?
      ORDER BY bm25(notes_fts, 0, 5.0, 1.0)
      LIMIT ?`,
    [fts, limit],
  );
}

// ---- links & graph ----

/** Replace a note's outgoing links. Targets that no longer exist are skipped. */
export async function setLinks(fromNote: string, toNotes: string[]) {
  const db = await getDb();
  await db.execute("DELETE FROM links WHERE from_note = ?", [fromNote]);
  for (const to of toNotes) {
    if (to === fromNote) continue;
    await db.execute("INSERT OR IGNORE INTO links (from_note, to_note) SELECT ?, id FROM notes WHERE id = ?", [fromNote, to]);
  }
}

export async function backlinks(noteId: string) {
  const db = await getDb();
  return db.select<{ id: string; title: string; subject_id: string | null; snippet: string }>(
    `SELECT n.id, n.title, n.subject_id, substr(n.plain_text, 1, 160) AS snippet
       FROM links l JOIN notes n ON n.id = l.from_note
      WHERE l.to_note = ?
      ORDER BY n.updated_at DESC`,
    [noteId],
  );
}

export interface GraphNoteRow {
  id: string;
  title: string;
  subject_id: string | null;
  cards: number;
  reviewed: number;
  /** Mean FSRS stability (days) of reviewed cards; null if none reviewed. */
  stability: number | null;
}

export async function graphData() {
  const db = await getDb();
  const nodes = await db.select<GraphNoteRow>(
    `SELECT n.id, n.title, n.subject_id,
            COUNT(c.id) AS cards,
            COALESCE(SUM(c.fsrs_state_json IS NOT NULL), 0) AS reviewed,
            AVG(json_extract(c.fsrs_state_json, '$.stability')) AS stability
       FROM notes n LEFT JOIN cards c ON c.note_id = n.id
      GROUP BY n.id`,
  );
  const links = await db.select<{ from_note: string; to_note: string }>("SELECT from_note, to_note FROM links");
  return { nodes, links };
}

/**
 * 0..1 "how well do I know this note". Notes without cards are null (unknown);
 * unreviewed cards count as 0; stability saturates around a month.
 */
export function mastery(n: Pick<GraphNoteRow, "cards" | "reviewed" | "stability">): number | null {
  if (!n.cards) return null;
  const reviewedShare = n.reviewed / n.cards;
  const strength = Math.min(1, (n.stability ?? 0) / 30);
  return reviewedShare * strength;
}
