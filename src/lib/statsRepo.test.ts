import { describe, expect, it } from "vitest";
import { lastDays, streak } from "./statsRepo";

describe("stats helpers", () => {
  it("lists the last n days ending today", () => {
    expect(lastDays(3, "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  it("counts a streak ending today or yesterday", () => {
    const days = new Set(["2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(streak(days, "2026-10-31")).toBe(3);
    expect(streak(days, "2026-11-01")).toBe(3); // today not studied yet: streak still alive
    expect(streak(days, "2026-11-02")).toBe(0);
  });
});
