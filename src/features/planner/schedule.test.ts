import { describe, expect, it } from "vitest";
import { addDays, daysBetween, planSchedule } from "./schedule";

describe("date helpers", () => {
  it("adds days across month ends and counts days", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
  });
});

describe("planSchedule", () => {
  const today = "2026-11-01";

  it("schedules a learn and a later review for every topic, before the exam", () => {
    const plan = planSchedule({
      today,
      dailyMinutes: 240,
      exams: [{ id: "e", date: "2026-11-11", topics: [{ id: "a", weight: 0.2 }, { id: "b", weight: 0.9 }, { id: "c", weight: 0.5 }] }],
    });
    expect(plan).toHaveLength(6);
    for (const id of ["a", "b", "c"]) {
      const learn = plan.find((p) => p.topicId === id && p.kind === "learn")!;
      const review = plan.find((p) => p.topicId === id && p.kind === "review")!;
      expect(learn.date >= today).toBe(true);
      expect(review.date > learn.date).toBe(true);
      expect(review.date < "2026-11-11").toBe(true);
    }
    // hardest topic is learned first and gets more time
    const learns = plan.filter((p) => p.kind === "learn");
    expect(learns[0].topicId).toBe("b");
    expect(learns.find((p) => p.topicId === "b")!.minutes).toBeGreaterThan(learns.find((p) => p.topicId === "a")!.minutes);
    expect(plan.every((p) => !p.overbooked)).toBe(true);
  });

  it("respects the daily budget by sliding sessions later", () => {
    const topics = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, weight: 1 }));
    const plan = planSchedule({ today, dailyMinutes: 60, exams: [{ id: "e", date: "2026-11-15", topics }] });
    const perDay = new Map<string, number>();
    for (const p of plan) perDay.set(p.date, (perDay.get(p.date) ?? 0) + p.minutes);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(60);
    expect(plan.every((p) => p.date < "2026-11-15")).toBe(true);
  });

  it("overbooks rather than dropping sessions when time runs out", () => {
    const plan = planSchedule({
      today,
      dailyMinutes: 30,
      exams: [{ id: "e", date: "2026-11-02", topics: [{ id: "a", weight: 1 }, { id: "b", weight: 1 }] }],
    });
    expect(plan.map((p) => p.topicId).sort()).toEqual(["a", "b"]); // one day → learn only
    expect(plan.some((p) => p.overbooked)).toBe(true);
    expect(plan.every((p) => p.date === today)).toBe(true);
  });

  it("only schedules a review for topics already learned", () => {
    const plan = planSchedule({
      today,
      dailyMinutes: 120,
      exams: [{ id: "e", date: "2026-11-06", topics: [{ id: "a", weight: 0.5, learned: true }, { id: "b", weight: 0.5 }] }],
    });
    expect(plan.filter((p) => p.topicId === "a").map((p) => p.kind)).toEqual(["review"]);
    expect(plan.filter((p) => p.topicId === "b").map((p) => p.kind).sort()).toEqual(["learn", "review"]);
  });

  it("skips exams that are today or past", () => {
    expect(planSchedule({ today, dailyMinutes: 60, exams: [{ id: "e", date: today, topics: [{ id: "a", weight: 1 }] }] })).toEqual([]);
  });
});
