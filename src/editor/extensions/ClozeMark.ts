import { Mark, mergeAttributes } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    cloze: {
      /** Hide the selection in review (or un-hide it if it's already a cloze). */
      toggleCloze: () => ReturnType;
    };
  }
}

/** Give every cloze in pasted content a fresh id, so a copy becomes a new card instead of stealing the old one. */
function refreshIds(fragment: Fragment): Fragment {
  const ids = new Map<string, string>();
  const mapNode = (node: PMNode): PMNode => {
    if (node.isText) {
      const marks = node.marks.map((m) => {
        if (m.type.name !== "cloze") return m;
        if (!ids.has(m.attrs.id)) ids.set(m.attrs.id, crypto.randomUUID());
        return m.type.create({ ...m.attrs, id: ids.get(m.attrs.id) });
      });
      return node.mark(marks);
    }
    const children: PMNode[] = [];
    node.content.forEach((c) => children.push(mapNode(c)));
    return node.copy(Fragment.from(children));
  };
  const out: PMNode[] = [];
  fragment.forEach((n) => out.push(mapNode(n)));
  return Fragment.from(out);
}

export const ClozeMark = Mark.create({
  name: "cloze",
  inclusive: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-cloze"),
        renderHTML: (attrs) => ({ "data-cloze": attrs.id }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-cloze]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "cloze" }), 0];
  },

  addCommands() {
    return {
      toggleCloze:
        () =>
        ({ editor, chain }) => {
          if (editor.isActive("cloze")) return chain().extendMarkRange("cloze").unsetMark("cloze").run();
          if (editor.state.selection.empty) return false;
          return chain().setMark("cloze", { id: crypto.randomUUID() }).run();
        },
    };
  },

  addKeyboardShortcuts() {
    return { "Mod-Shift-c": () => this.editor.commands.toggleCloze() };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPasted: (slice) => new Slice(refreshIds(slice.content), slice.openStart, slice.openEnd),
        },
      }),
    ];
  },
});
