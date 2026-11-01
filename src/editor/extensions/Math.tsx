import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import katex from "katex";
import { useEffect, useMemo, useRef, useState } from "react";

function renderLatex(latex: string, displayMode: boolean) {
  try {
    return { html: katex.renderToString(latex || "\\square", { displayMode, throwOnError: true }), error: null };
  } catch (e) {
    return { html: "", error: e instanceof Error ? e.message.replace(/^KaTeX parse error: /, "") : String(e) };
  }
}

// ---------- inline: $x^2$ ----------

function MathInlineView({ node, updateAttributes, deleteNode, selected, editor, getPos }: ReactNodeViewProps) {
  const latex: string = node.attrs.latex;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const { html, error } = useMemo(() => renderLatex(editing ? draft : latex, false), [editing, draft, latex]);

  const commit = () => {
    setEditing(false);
    if (!draft.trim()) return deleteNode();
    updateAttributes({ latex: draft });
    // put the caret right after the formula so typing continues naturally
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (pos !== undefined) editor.chain().focus().setTextSelection(pos + node.nodeSize).run();
  };

  return (
    <NodeViewWrapper as="span" className={`math-inline ${selected ? "is-selected" : ""}`}>
      <span
        onClick={() => editor.isEditable && (setDraft(latex), setEditing(true))}
        className={error && !editing ? "math-error" : undefined}
        title={error ?? latex}
        dangerouslySetInnerHTML={{ __html: html || escapeHtml(latex) }}
      />
      {editing && (
        <span className="math-popover" contentEditable={false}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                commit();
              }
            }}
            spellCheck={false}
          />
          {error && <span className="math-popover-error">{error}</span>}
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { latex: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "span[data-math-inline]", getAttrs: (el) => ({ latex: (el as HTMLElement).dataset.latex ?? "" }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-math-inline": "", "data-latex": node.attrs.latex }), `$${node.attrs.latex}$`];
  },

  renderText({ node }) {
    return `$${node.attrs.latex}$`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  addInputRules() {
    return [
      new InputRule({
        // `$…$` where the content doesn't start/end with whitespace, so "$5 and $10" stays text
        find: /(^|[^$\\])\$([^$\s](?:[^$]*[^$\s])?)\$$/,
        handler: ({ state, range, match }) => {
          const start = range.from + match[1].length;
          state.tr.replaceWith(start, range.to, this.type.create({ latex: match[2] }));
        },
      }),
    ];
  },
});

// ---------- block: $$ … $$ ----------

function MathBlockView({ node, updateAttributes, deleteNode, selected, editor }: ReactNodeViewProps) {
  const latex: string = node.attrs.latex;
  const [editing, setEditing] = useState(!latex);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { html, error } = useMemo(() => renderLatex(latex, true), [latex]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  return (
    <NodeViewWrapper className={`math-block ${selected ? "is-selected" : ""}`} data-drag-handle>
      <div
        className="math-block-render"
        onClick={() => editor.isEditable && setEditing(true)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {error && <div className="math-popover-error">{error}</div>}
      {editing && (
        <textarea
          ref={ref}
          className="math-block-input"
          value={latex}
          rows={Math.max(2, latex.split("\n").length)}
          placeholder="LaTeX, e.g. \int_0^1 x^2\,dx = \tfrac13"
          spellCheck={false}
          onChange={(e) => updateAttributes({ latex: e.target.value })}
          onBlur={() => {
            if (!latex.trim()) deleteNode();
            else setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
              e.preventDefault();
              e.currentTarget.blur();
              editor.commands.focus();
            }
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { latex: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "div[data-math-block]", getAttrs: (el) => ({ latex: (el as HTMLElement).dataset.latex ?? "" }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-math-block": "", "data-latex": node.attrs.latex }), `$$${node.attrs.latex}$$`];
  },

  renderText({ node }) {
    return `$$${node.attrs.latex}$$`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$\s$/,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          // replace the whole (now empty) paragraph with the math block
          state.tr.replaceWith($from.before(), $from.after(), this.type.create());
        },
      }),
    ];
  },
});

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
