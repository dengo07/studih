import type { JSONContent } from "@tiptap/core";
import type { VocabRow } from "./extensions/VocabTable";

/** Placeholder that marks the hidden part of a cloze card's front. */
export const BLANK = "{{…}}";

export interface ExtractedCard {
  anchorId: string;
  kind: "cloze" | "vocab";
  front: string;
  back: string;
}

interface Segment {
  text: string;
  clozeId: string | null;
}

/** Flatten a textblock into segments, merging neighbours that belong to the same cloze. */
function segmentsOf(block: JSONContent): Segment[] {
  const out: Segment[] = [];
  for (const child of block.content ?? []) {
    let text = "";
    if (child.type === "text") text = child.text ?? "";
    else if (child.type === "mathInline") text = `$${child.attrs?.latex ?? ""}$`;
    else if (child.type === "hardBreak") text = " ";
    const clozeId = (child.marks?.find((m) => m.type === "cloze")?.attrs?.id as string | undefined) ?? null;
    const last = out[out.length - 1];
    if (last && last.clozeId === clozeId) last.text += text;
    else out.push({ text, clozeId });
  }
  return out;
}

function walk(node: JSONContent, visit: (n: JSONContent) => void) {
  visit(node);
  node.content?.forEach((c) => walk(c, visit));
}

/**
 * Derive flashcards from a note:
 * - every cloze mark → a card whose front is its sentence block with that span blanked
 *   (other clozes in the same block stay visible as context)
 * - every complete vocab-table row → a term → translation card
 */
export function extractCards(doc: JSONContent): ExtractedCard[] {
  const cards: ExtractedCard[] = [];
  const seen = new Set<string>();

  walk(doc, (node) => {
    if (node.type === "vocabTable") {
      const lang = (node.attrs?.lang as string) || "";
      for (const row of (node.attrs?.rows ?? []) as VocabRow[]) {
        if (!row.term.trim() || !row.translation.trim() || seen.has(row.id)) continue;
        seen.add(row.id);
        cards.push({
          anchorId: row.id,
          kind: "vocab",
          front: lang ? `${row.term.trim()}  ·  ${lang}` : row.term.trim(),
          back: row.example.trim() ? `${row.translation.trim()}\n${row.example.trim()}` : row.translation.trim(),
        });
      }
      return;
    }

    if (node.type !== "paragraph" && node.type !== "heading") return;
    const segs = segmentsOf(node);
    for (const seg of segs) {
      if (!seg.clozeId || seen.has(seg.clozeId) || !seg.text.trim()) continue;
      seen.add(seg.clozeId);
      const front = segs.map((s) => (s === seg ? BLANK : s.text)).join("").trim();
      cards.push({ anchorId: seg.clozeId, kind: "cloze", front, back: seg.text.trim() });
    }
  });

  return cards;
}
