import { beforeEach, describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore } from "./fuzzy";
import { extractLinks } from "../editor/extensions/WikiLink";
import { openWasmDb, setDb } from "./db";
import { backlinks, createNote, deleteNote, graphData, mastery, setLinks } from "./repo";

describe("fuzzy", () => {
  it("prefers exact, prefix, then substring, then subsequence", () => {
    const titles = ["Linear algebra", "Eigenvalues", "Algebraic structures", "Lagrange"];
    expect(fuzzyFilter(titles, "alg", (t) => t)).toEqual(["Algebraic structures", "Linear algebra"]);
    expect(fuzzyFilter(titles, "lgr", (t) => t)[0]).toBe("Lagrange"); // word-start + shortest wins
    expect(fuzzyScore("eig", "Eigenvalues")).toBeGreaterThan(fuzzyScore("eig", "Some eigen stuff"));
    expect(fuzzyScore("xyz", "Eigenvalues")).toBe(-1);
  });
});

describe("links", () => {
  beforeEach(async () => setDb(await openWasmDb({ persist: false })));

  it("extracts unique link targets from a doc", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "wikiLink", attrs: { noteId: "a" } }, { type: "wikiLink", attrs: { noteId: "b" } }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "wikiLink", attrs: { noteId: "a" } }] }] }] },
      ],
    };
    expect(extractLinks(doc)).toEqual(["a", "b"]);
  });

  it("stores links, ignores dangling targets, and powers backlinks + graph", async () => {
    const a = await createNote(null, "Chain rule");
    const b = await createNote(null, "Derivatives");
    await setLinks(a.id, [b.id, "missing", a.id]);
    expect((await backlinks(b.id)).map((r) => r.title)).toEqual(["Chain rule"]);

    const g = await graphData();
    expect(g.links).toEqual([{ from_note: a.id, to_note: b.id }]);
    expect(g.nodes.find((n) => n.id === a.id)).toMatchObject({ cards: 0, reviewed: 0 });

    await deleteNote(b.id);
    expect((await graphData()).links).toEqual([]);
  });

  it("scores mastery from review coverage and stability", () => {
    expect(mastery({ cards: 0, reviewed: 0, stability: null })).toBeNull();
    expect(mastery({ cards: 4, reviewed: 0, stability: null })).toBe(0);
    expect(mastery({ cards: 2, reviewed: 2, stability: 60 })).toBe(1);
    expect(mastery({ cards: 2, reviewed: 1, stability: 15 })).toBeCloseTo(0.25);
  });
});
