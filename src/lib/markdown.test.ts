import { describe, expect, it } from "vitest";
import { parseCardsJson, tutorSystem } from "./prompts";

// renderMarkdown/markdownToEditorHtml need a DOM (DOMPurify), so they're checked in the browser.

describe("parseCardsJson", () => {
  it("reads a fenced JSON array and drops malformed entries", () => {
    const reply = 'Here you go:\n```json\n[{"front":"What is $f\'(x)$ of $x^2$?","back":"$2x$"},{"front":"","back":"x"},{"q":1}]\n```';
    expect(parseCardsJson(reply)).toEqual([{ front: "What is $f'(x)$ of $x^2$?", back: "$2x$" }]);
  });

  it("returns nothing for prose", () => {
    expect(parseCardsJson("Sorry, I can't")).toEqual([]);
    expect(parseCardsJson("[not json]")).toEqual([]);
  });
});

describe("tutorSystem", () => {
  it("embeds notes and caps the total context", () => {
    const big = "x".repeat(10000);
    const sys = tutorSystem("quiz", [
      { title: 'A "quoted" title', text: big },
      { title: "B", text: big },
      { title: "C", text: big },
      { title: "D", text: big },
    ]);
    expect(sys).toContain("<note title=\"A 'quoted' title\">");
    expect(sys).not.toContain('title="D"'); // budget exhausted
    expect(sys.length).toBeLessThan(18000);
  });
});
