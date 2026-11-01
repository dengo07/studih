import { getDb } from "./db";
import { mastery, newId } from "./repo";
import { planSchedule, toIso } from "../features/planner/schedule";

export interface Exam {
  id: string;
  subject_id: string | null;
  title: string;
  date: string;
  topics: number;
  done_topics: number;
}

export interface Topic {
  id: string;
  exam_id: string;
  note_id: string | null;
  title: string;
  done: number;
}

export interface PlanRow {
  id: string;
  date: string;
  topic_id: string;
  minutes: number;
  done: number;
  kind: "learn" | "review";
  topic_title: string;
  note_id: string | null;
  exam_title: string;
  exam_date: string;
  subject_id: string | null;
}

export const today = () => toIso(new Date());

export async function listExams(): Promise<Exam[]> {
  const db = await getDb();
  return db.select<Exam>(
    `SELECT e.*, COUNT(t.id) AS topics, COALESCE(SUM(t.done), 0) AS done_topics
       FROM exams e LEFT JOIN exam_topics t ON t.exam_id = e.id
      GROUP BY e.id ORDER BY e.date`,
  );
}

export async function createExam(subjectId: string | null, title: string, date: string) {
  const db = await getDb();
  const id = newId();
  await db.execute("INSERT INTO exams (id, subject_id, title, date) VALUES (?, ?, ?, ?)", [id, subjectId, title, date]);
  return id;
}

export async function deleteExam(id: string) {
  const db = await getDb();
  await db.execute("DELETE FROM exams WHERE id = ?", [id]);
}

export async function listTopics(examId: string) {
  const db = await getDb();
  return db.select<Topic>("SELECT * FROM exam_topics WHERE exam_id = ? ORDER BY rowid", [examId]);
}

export async function addTopic(examId: string, title: string, noteId: string | null = null) {
  const db = await getDb();
  await db.execute("INSERT INTO exam_topics (id, exam_id, note_id, title) VALUES (?, ?, ?, ?)", [newId(), examId, noteId, title]);
}

export async function setTopicDone(id: string, done: boolean) {
  const db = await getDb();
  await db.execute("UPDATE exam_topics SET done = ? WHERE id = ?", [done ? 1 : 0, id]);
  // a finished topic needs no more sessions
  if (done) await db.execute("DELETE FROM plan_items WHERE topic_id = ? AND done = 0", [id]);
}

export async function deleteTopic(id: string) {
  const db = await getDb();
  await db.execute("DELETE FROM exam_topics WHERE id = ?", [id]);
}

/** Notes added as topics for every note in a subject, so a whole course can be planned in one click. */
export async function addTopicsFromSubject(examId: string, subjectId: string) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO exam_topics (id, exam_id, note_id, title)
     SELECT lower(hex(randomblob(16))), ?, n.id, CASE WHEN n.title = '' THEN 'Untitled' ELSE n.title END
       FROM notes n
      WHERE n.subject_id = ? AND n.id NOT IN (SELECT note_id FROM exam_topics WHERE exam_id = ? AND note_id IS NOT NULL)
      ORDER BY n.title`,
    [examId, subjectId, examId],
  );
}

export async function planFor(from: string, to: string) {
  const db = await getDb();
  return db.select<PlanRow>(
    `SELECT p.*, t.title AS topic_title, t.note_id, e.title AS exam_title, e.date AS exam_date, e.subject_id
       FROM plan_items p
       JOIN exam_topics t ON t.id = p.topic_id
       JOIN exams e ON e.id = t.exam_id
      WHERE p.date BETWEEN ? AND ?
      ORDER BY p.date, p.kind, t.title`,
    [from, to],
  );
}

export async function missedCount(day = today()) {
  const db = await getDb();
  const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM plan_items WHERE done = 0 AND date < ?", [day]);
  return n;
}

export async function setPlanItemDone(id: string, done: boolean) {
  const db = await getDb();
  await db.execute("UPDATE plan_items SET done = ? WHERE id = ?", [done ? 1 : 0, id]);
  // once every session of a topic is done (and it has a review), the topic counts as done
  await db.execute(
    `UPDATE exam_topics SET done = CASE WHEN
        NOT EXISTS (SELECT 1 FROM plan_items WHERE topic_id = exam_topics.id AND done = 0)
        AND EXISTS (SELECT 1 FROM plan_items WHERE topic_id = exam_topics.id AND kind = 'review')
      THEN 1 ELSE 0 END
     WHERE id = (SELECT topic_id FROM plan_items WHERE id = ?)`,
    [id],
  );
}

/**
 * Throw away every unfinished session (including missed past ones) and plan the remaining
 * work again from today. Weak notes (low card mastery) get more time.
 */
export async function regeneratePlan(dailyMinutes: number, day = today()) {
  const db = await getDb();
  const exams = await db.select<{ id: string; date: string }>("SELECT id, date FROM exams WHERE date > ?", [day]);
  const topics = await db.select<{
    id: string;
    exam_id: string;
    learned: number;
    cards: number;
    reviewed: number;
    stability: number | null;
  }>(
    `SELECT t.id, t.exam_id,
            EXISTS (SELECT 1 FROM plan_items p WHERE p.topic_id = t.id AND p.kind = 'learn' AND p.done = 1) AS learned,
            COUNT(c.id) AS cards,
            COALESCE(SUM(c.fsrs_state_json IS NOT NULL), 0) AS reviewed,
            AVG(json_extract(c.fsrs_state_json, '$.stability')) AS stability
       FROM exam_topics t LEFT JOIN cards c ON c.note_id = t.note_id
      WHERE t.done = 0
      GROUP BY t.id`,
  );

  await db.execute("DELETE FROM plan_items WHERE done = 0");

  const plan = planSchedule({
    today: day,
    dailyMinutes,
    exams: exams.map((e) => ({
      id: e.id,
      date: e.date,
      topics: topics
        .filter((t) => t.exam_id === e.id)
        .map((t) => ({ id: t.id, weight: 1 - (mastery(t) ?? 0.4), learned: !!t.learned })),
    })),
  });
  for (const s of plan) {
    await db.execute("INSERT INTO plan_items (id, date, topic_id, minutes, done, kind) VALUES (?, ?, ?, ?, 0, ?)", [
      newId(), s.date, s.topicId, s.minutes, s.kind,
    ]);
  }
  return plan;
}

// ---- focus sessions ----

export async function logFocus(subjectId: string | null, startedAt: number, minutes: number, kind: "focus" | "break" = "focus") {
  const db = await getDb();
  await db.execute("INSERT INTO focus_sessions (id, subject_id, started_at, minutes, kind) VALUES (?, ?, ?, ?, ?)", [
    newId(), subjectId, startedAt, minutes, kind,
  ]);
}
