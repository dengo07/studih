import { beforeEach, describe, expect, it } from "vitest";
import { openWasmDb, setDb } from "./db";
import * as repo from "./repo";

beforeEach(async () => {
  setDb(await openWasmDb({ persist: false }));
});

describe("toFtsQuery", () => {
  it("turns words into quoted prefix terms", () => {
    expect(repo.toFtsQuery('  chain  "rule ')).toBe('"chain"* "rule"*');
    expect(repo.toFtsQuery("   ")).toBe("");
  });
});

describe("notes", () => {
  it("creates, saves and finds notes via full-text search", async () => {
    const math = await repo.createSubject("Calculus");
    const note = await repo.createNote(math.id, "Derivatives");
    await repo.saveNoteContent(note.id, '{"type":"doc"}', "The chain rule differentiates compositions.");

    const hits = await repo.searchNotes("chai");
    expect(hits.map((h) => h.id)).toEqual([note.id]);
    expect(hits[0].snippet).toContain("<mark>chain</mark>");

    expect(await repo.searchNotes("deriv")).toHaveLength(1); // title is indexed too
    expect(await repo.searchNotes("integral")).toHaveLength(0);
  });

  it("keeps the search index in sync on rename and delete", async () => {
    const note = await repo.createNote(null, "Old title");
    await repo.updateNoteMeta(note.id, { title: "Vectors" });
    expect(await repo.searchNotes("old")).toHaveLength(0);
    expect(await repo.searchNotes("vectors")).toHaveLength(1);

    await repo.deleteNote(note.id);
    expect(await repo.searchNotes("vectors")).toHaveLength(0);
  });

  it("unassigns notes when their subject is deleted", async () => {
    const s = await repo.createSubject("Spanish");
    const note = await repo.createNote(s.id, "Verbs");
    await repo.deleteSubject(s.id);
    expect((await repo.getNote(note.id))?.subject_id).toBeNull();
  });
});
