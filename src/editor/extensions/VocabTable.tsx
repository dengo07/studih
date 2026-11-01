import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useRef } from "react";

export interface VocabRow {
  id: string;
  term: string;
  translation: string;
  example: string;
}

const FIELDS = ["term", "translation", "example"] as const;
type Field = (typeof FIELDS)[number];

export const newRow = (): VocabRow => ({ id: crypto.randomUUID(), term: "", translation: "", example: "" });

function VocabView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const rows: VocabRow[] = node.attrs.rows;
  const lang: string = node.attrs.lang;
  const table = useRef<HTMLTableElement>(null);

  const setRows = (next: VocabRow[]) => updateAttributes({ rows: next });
  const setCell = (i: number, field: Field, value: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  const focusCell = (row: number, col: number) =>
    requestAnimationFrame(() =>
      table.current?.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`)?.focus(),
    );

  const addRow = (after = rows.length - 1) => {
    setRows([...rows.slice(0, after + 1), newRow(), ...rows.slice(after + 1)]);
    focusCell(after + 1, 0);
  };

  return (
    <NodeViewWrapper className="vocab" data-drag-handle>
      <div className="vocab-bar" contentEditable={false}>
        <span>Vocabulary</span>
        <input
          className="vocab-lang"
          value={lang}
          placeholder="language"
          onChange={(e) => updateAttributes({ lang: e.target.value })}
          title="Language of the terms (used for translation & drills)"
        />
        <span className="vocab-count">{rows.filter((r) => r.term && r.translation).length} words</span>
      </div>
      <table ref={table} contentEditable={false}>
        <thead>
          <tr>
            <th>Term</th>
            <th>Translation</th>
            <th>Example</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} data-anchor={row.id}>
              {FIELDS.map((field, col) => (
                <td key={field}>
                  <input
                    data-cell={`${i}-${col}`}
                    value={row[field]}
                    readOnly={!editor.isEditable}
                    placeholder={i === 0 ? { term: "el gato", translation: "the cat", example: "El gato duerme." }[field] : ""}
                    onChange={(e) => setCell(i, field, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRow(i);
                      } else if (e.key === "Backspace" && col === 0 && !row.term && !row.translation && !row.example && rows.length > 1) {
                        e.preventDefault();
                        setRows(rows.filter((_, j) => j !== i));
                        focusCell(Math.max(0, i - 1), 0);
                      } else if (e.key === "ArrowDown") {
                        focusCell(Math.min(i + 1, rows.length - 1), col);
                      } else if (e.key === "ArrowUp") {
                        focusCell(Math.max(i - 1, 0), col);
                      }
                    }}
                  />
                </td>
              ))}
              <td className="vocab-del">
                {rows.length > 1 && (
                  <button title="Remove row" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="vocab-add" contentEditable={false} onClick={() => addRow()}>
        + Add word <span>(Enter)</span>
      </button>
    </NodeViewWrapper>
  );
}

export const VocabTable = Node.create({
  name: "vocabTable",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      lang: { default: "" },
      rows: { default: [] as VocabRow[] },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-vocab]",
        getAttrs: (el) => {
          try {
            return { lang: (el as HTMLElement).dataset.lang ?? "", rows: JSON.parse((el as HTMLElement).dataset.rows ?? "[]") };
          } catch {
            return { lang: "", rows: [newRow()] };
          }
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-vocab": "", "data-lang": node.attrs.lang, "data-rows": JSON.stringify(node.attrs.rows) }),
    ];
  },

  renderText({ node }) {
    return (node.attrs.rows as VocabRow[])
      .filter((r) => r.term || r.translation)
      .map((r) => `${r.term} — ${r.translation}${r.example ? ` (${r.example})` : ""}`)
      .join("\n");
  },

  addNodeView() {
    return ReactNodeViewRenderer(VocabView);
  },
});
