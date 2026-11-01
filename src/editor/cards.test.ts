import { beforeEach, describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { BLANK, extractCards } from "./cards";
import { openWasmDb, setDb } from "../lib/db";
import { createNote } from "../lib/repo";
import { dueCards, dueCount, reviewCard, syncNoteCards } from "../lib/cardsRepo";
import { Rating } from "../lib/fsrs";

const cloze = (text: string, id: string, extra: { type: string }[] = []) => ({
  type: "text",
  text,
  marks: [{ type: "cloze", attrs: { id } }, ...extra],
});

const doc: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "The derivative of " },
        { type: "mathInline", attrs: { latex: "x^2" } },
        { type: "text", text: " is " },
        cloze("2", "c1"),
        cloze("x", "c1", [{ type: "bold" }]), // same cloze split by formatting
        { type: "text", text: ", found by the " },
        cloze("power rule", "c2"),
        { type: "text", text: "." },
      ],
    },
    { type: "paragraph", content: [{ type: "text", text: "no cards here" }] },
    {
      type: "vocabTable",
      attrs: {
        lang: "es",
        rows: [
          { id: "v1", term: "el perro", translation: "the dog", example: "" },
          { id: "v2", term: "la casa", translation: "", example: "" }, // incomplete → skipped
          { id: "v3", term: "comer", translation: "to eat", example: "Como pan." },
        ],
      },
    },
  ],
};

describe("extractCards", () => {
  it("builds cloze cards with the span blanked and other clozes as context", () => {
    const cards = extractCards(doc);
    expect(cards.filter((c) => c.kind === "cloze")).toEqual([
      { anchorId: "c1", kind: "cloze", front: `The derivative of $x^2$ is ${BLANK}, found by the power rule.`, back: "2x" },
      { anchorId: "c2", kind: "cloze", front: `The derivative of $x^2$ is 2x, found by the ${BLANK}.`, back: "power rule" },
    ]);
  });

  it("turns complete vocab rows into cards", () => {
    const vocab = extractCards(doc).filter((c) => c.kind === "vocab");
    expect(vocab.map((c) => c.anchorId)).toEqual(["v1", "v3"]);
    expect(vocab[1]).toMatchObject({ front: "comer  ·  es", back: "to eat\nComo pan." });
  });
});

describe("syncNoteCards", () => {
  beforeEach(async () => setDb(await openWasmDb({ persist: false })));

  it("inserts, keeps review state on edit, and deletes removed anchors", async () => {
    const note = await createNote(null, "Calc");
    const t0 = 1_000_000;
    await syncNoteCards(note.id, extractCards(doc), t0);
    expect(await dueCount(t0)).toBe(4);

    const [first] = await dueCards({ now: t0 });
    const { due } = await reviewCard(first, Rating.Good, new Date(t0));
    expect(due).toBeGreaterThan(t0);

    // edit the text of that card and remove one vocab row
    const edited = extractCards(doc)
      .filter((c) => c.anchorId !== "v3")
      .map((c) => (c.anchorId === first.anchor_id ? { ...c, back: "changed" } : c));
    await syncNoteCards(note.id, edited, t0);

    const all = await dueCards({ now: Number.MAX_SAFE_INTEGER });
    expect(all).toHaveLength(3);
    const reviewed = all.find((c) => c.id === first.id)!;
    expect(reviewed.back).toBe("changed");
    expect(reviewed.due_at).toBe(due); // schedule survived the edit
    expect(all.some((c) => c.anchor_id === "v3")).toBe(false);
  });
});
