import { beforeEach, describe, expect, it } from "vitest";
import { openWasmDb, setDb } from "./db";
import { createNote, createSubject } from "./repo";
import { addTopic, addTopicsFromSubject, createExam, listExams, listTopics, missedCount, planFor, regeneratePlan, setPlanItemDone } from "./plannerRepo";

beforeEach(async () => setDb(await openWasmDb({ persist: false })));

describe("planner repo", () => {
  it("plans topics, marks progress, and rebalances missed sessions", async () => {
    const s = await createSubject("Calculus");
    await createNote(s.id, "Limits");
    await createNote(s.id, "Derivatives");
    const exam = await createExam(s.id, "Midterm", "2026-11-10");
    await addTopicsFromSubject(exam, s.id);
    await addTopicsFromSubject(exam, s.id); // idempotent
    await addTopic(exam, "Past papers");
    expect((await listTopics(exam)).map((t) => t.title)).toEqual(["Derivatives", "Limits", "Past papers"]);

    await regeneratePlan(120, "2026-11-01");
    const plan = await planFor("2026-11-01", "2026-11-09");
    expect(plan).toHaveLength(6);
    expect(plan.every((p) => p.exam_title === "Midterm")).toBe(true);

    // finish both sessions of one topic → topic done
    const topicId = plan[0].topic_id;
    for (const p of plan.filter((p) => p.topic_id === topicId)) await setPlanItemDone(p.id, true);
    expect((await listExams())[0].done_topics).toBe(1);

    // a day later with nothing else done: missed sessions get rebalanced from the new today
    const missedBefore = await missedCount("2026-11-05");
    expect(missedBefore).toBeGreaterThan(0);
    await regeneratePlan(120, "2026-11-05");
    expect(await missedCount("2026-11-05")).toBe(0);
    const after = await planFor("2026-11-01", "2026-11-09");
    expect(after.filter((p) => !p.done).every((p) => p.date >= "2026-11-05")).toBe(true);
    expect(after.filter((p) => p.done)).toHaveLength(2); // finished work is kept
    expect(after.some((p) => p.topic_id === topicId && !p.done)).toBe(false);
  });
});
