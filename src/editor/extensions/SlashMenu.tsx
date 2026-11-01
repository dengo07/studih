import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { newRow } from "./VocabTable";

interface Command {
  title: string;
  hint: string;
  icon: string;
  keywords?: string;
  run(editor: Editor, range: Range): void;
}

const COMMANDS: Command[] = [
  { title: "Heading 1", hint: "Big section heading", icon: "H1", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: "Heading 2", hint: "Medium heading", icon: "H2", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: "Heading 3", hint: "Small heading", icon: "H3", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { title: "Bullet list", hint: "- item", icon: "•", keywords: "ul unordered", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Numbered list", hint: "1. item", icon: "1.", keywords: "ol ordered", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: "Quote", hint: "> quote", icon: "❝", keywords: "blockquote", run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  {
    title: "Math block",
    hint: "Display equation ($$)",
    icon: "∑",
    keywords: "latex equation formula katex",
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent({ type: "mathBlock" }).run(),
  },
  {
    title: "Inline math",
    hint: "Type $x^2$ in text",
    icon: "x²",
    keywords: "latex formula",
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent({ type: "mathInline", attrs: { latex: "x" } }).run(),
  },
  {
    title: "Runnable code",
    hint: "Python / JS you can run",
    icon: "▶",
    keywords: "code python javascript program run",
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent({ type: "codeRun", attrs: { language: "python" } }).run(),
  },
  {
    title: "Code snippet",
    hint: "Plain code, not runnable",
    icon: "</>",
    keywords: "pre codeblock",
    run: (e, r) => e.chain().focus().deleteRange(r).setCodeBlock().run(),
  },
  {
    title: "Vocabulary table",
    hint: "Words → practice cards",
    icon: "Aa",
    keywords: "vocab words language translation",
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent({ type: "vocabTable", attrs: { rows: [newRow()] } }).run(),
  },
  { title: "Divider", hint: "---", icon: "—", keywords: "hr rule", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

export function filterCommands(query: string) {
  const q = query.toLowerCase();
  return COMMANDS.filter((c) => `${c.title} ${c.keywords ?? ""}`.toLowerCase().includes(q));
}

interface MenuHandle {
  onKeyDown(e: KeyboardEvent): boolean;
}

const Menu = forwardRef<MenuHandle, SuggestionProps<Command>>(function Menu({ items, command }, ref) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(e) {
      if (e.key === "ArrowDown") return setActive((a) => (a + 1) % items.length), true;
      if (e.key === "ArrowUp") return setActive((a) => (a - 1 + items.length) % items.length), true;
      if (e.key === "Enter" || e.key === "Tab") {
        if (items[active]) command(items[active]);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;
  return (
    <div className="slash-menu">
      {items.map((item, i) => (
        <button
          key={item.title}
          className={i === active ? "active" : ""}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            command(item);
          }}
        >
          <span className="slash-icon">{item.icon}</span>
          <span>
            <span className="slash-title">{item.title}</span>
            <span className="slash-hint">{item.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

export const SlashMenu = Extension.create({
  name: "slashMenu",

  addProseMirrorPlugins() {
    return [
      Suggestion<Command, Command>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        items: ({ query }) => filterCommands(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<MenuHandle, SuggestionProps<Command>> | null = null;

          const place = (props: SuggestionProps<Command>) => {
            const rect = props.clientRect?.();
            const el = renderer?.element as HTMLElement | undefined;
            if (!rect || !el) return;
            el.style.position = "fixed";
            el.style.zIndex = "60";
            el.style.left = `${rect.left}px`;
            const below = rect.bottom + 6;
            const fitsBelow = below + 340 < window.innerHeight;
            el.style.top = fitsBelow ? `${below}px` : "";
            el.style.bottom = fitsBelow ? "" : `${window.innerHeight - rect.top + 6}px`;
          };

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(Menu, { props, editor: props.editor });
              document.body.appendChild(renderer.element);
              place(props);
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
              place(props);
            },
            onKeyDown: ({ event }) => {
              if (event.key === "Escape") {
                renderer?.destroy();
                renderer?.element.remove();
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: () => {
              renderer?.destroy();
              renderer?.element.remove();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
