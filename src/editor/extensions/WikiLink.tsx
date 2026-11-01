import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer, type ReactNodeViewProps } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { fuzzyFilter } from "../../lib/fuzzy";
import { useApp } from "../../store";

interface LinkItem {
  id: string | null; // null → create a new note with `title`
  title: string;
  color?: string;
}

/** Note ids referenced by [[links]] in a document. */
export function extractLinks(doc: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (n: JSONContent) => {
    if (n.type === "wikiLink" && n.attrs?.noteId) ids.add(n.attrs.noteId);
    n.content?.forEach(walk);
  };
  walk(doc);
  return [...ids];
}

function WikiLinkView({ node }: ReactNodeViewProps) {
  // show the target's current title, so renames propagate everywhere
  const target = useApp((s) => s.notes.find((n) => n.id === node.attrs.noteId));
  const subject = useApp((s) => s.subjects.find((x) => x.id === target?.subject_id));
  const label = target?.title || node.attrs.title || "Untitled";

  return (
    <NodeViewWrapper
      as="span"
      className={`wiki-link ${target ? "" : "broken"}`}
      title={target ? `Open “${label}”` : "This note was deleted"}
      onClick={() => target && useApp.getState().openNote(target.id)}
    >
      <span className="wiki-dot" style={{ background: subject?.color ?? "var(--faint)" }} />
      {label}
    </NodeViewWrapper>
  );
}

interface MenuHandle {
  onKeyDown(e: KeyboardEvent): boolean;
}

const LinkMenu = forwardRef<MenuHandle, SuggestionProps<LinkItem>>(function LinkMenu({ items, command, query }, ref) {
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

  return (
    <div className="slash-menu">
      <div className="px-2 py-1 text-[11px] font-semibold tracking-wide text-faint uppercase">Link to note</div>
      {items.map((item, i) => (
        <button
          key={item.id ?? "new"}
          className={i === active ? "active" : ""}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            command(item);
          }}
        >
          {item.id ? (
            <>
              <span className="size-2 shrink-0 rounded-full" style={{ background: item.color ?? "var(--faint)" }} />
              <span className="slash-title truncate">{item.title || "Untitled"}</span>
            </>
          ) : (
            <span className="slash-title text-muted">
              + Create <b className="text-fg">“{query.trim()}”</b>
            </span>
          )}
        </button>
      ))}
    </div>
  );
});

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { noteId: { default: null }, title: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-wiki-link]",
        getAttrs: (el) => ({ noteId: (el as HTMLElement).dataset.noteId, title: el.textContent }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, { "data-wiki-link": "", "data-note-id": node.attrs.noteId }), node.attrs.title];
  },

  renderText({ node }) {
    const title = useApp.getState().notes.find((n) => n.id === node.attrs.noteId)?.title || node.attrs.title;
    return `[[${title}]]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<LinkItem, LinkItem>({
        pluginKey: new PluginKey("wikiLinkSuggestion"),
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: [" ", "(", " "],
        items: ({ query }) => {
          const { notes, subjects, selectedNoteId } = useApp.getState();
          const color = (sid: string | null) => subjects.find((s) => s.id === sid)?.color;
          const q = query.replace(/\]+$/, "");
          const candidates = notes.filter((n) => n.id !== selectedNoteId);
          const matches = q.trim()
            ? fuzzyFilter(candidates, q, (n) => n.title)
            : candidates.slice(0, 8); // most recently edited first
          const items: LinkItem[] = matches.map((n) => ({ id: n.id, title: n.title, color: color(n.subject_id) }));
          const exact = notes.some((n) => n.title.toLowerCase() === q.trim().toLowerCase());
          if (q.trim() && !exact) items.push({ id: null, title: q.trim() });
          return items;
        },
        command: ({ editor, range, props }) => {
          void (async () => {
            let { id, title } = props;
            if (!id) {
              const { selectedNoteId, notes, createNoteQuiet } = useApp.getState();
              const subjectId = notes.find((n) => n.id === selectedNoteId)?.subject_id ?? null;
              id = await createNoteQuiet(subjectId, title);
            }
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: "wikiLink", attrs: { noteId: id, title } },
                { type: "text", text: " " },
              ])
              .run();
          })();
        },
        render: () => {
          let renderer: ReactRenderer<MenuHandle, SuggestionProps<LinkItem>> | null = null;
          const place = (props: SuggestionProps<LinkItem>) => {
            const rect = props.clientRect?.();
            const el = renderer?.element as HTMLElement | undefined;
            if (!rect || !el) return;
            Object.assign(el.style, { position: "fixed", zIndex: "60", left: `${rect.left}px`, top: `${rect.bottom + 6}px` });
          };
          const close = () => {
            renderer?.destroy();
            renderer?.element.remove();
            renderer = null;
          };
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(LinkMenu, { props, editor: props.editor });
              document.body.appendChild(renderer.element);
              place(props);
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
              place(props);
            },
            onKeyDown: ({ event }) => {
              if (event.key === "Escape") return close(), true;
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: close,
          };
        },
      }),
    ];
  },
});
