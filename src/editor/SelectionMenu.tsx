import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { useState } from "react";
import { INLINE_ACTIONS, type InlineAction } from "../lib/prompts";

/** Floating toolbar shown over a text selection. */
export default function SelectionMenu({ editor, onAi }: { editor: Editor; onAi(action: InlineAction): void }) {
  const [aiOpen, setAiOpen] = useState(false);
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      code: editor.isActive("code"),
      cloze: editor.isActive("cloze"),
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor, state }) => editor.isEditable && !state.selection.empty && state.selection instanceof TextSelection}
      className="selection-menu"
      onMouseLeave={() => setAiOpen(false)}
    >
      <div className="relative">
        <button className={`ai-btn ${aiOpen ? "on" : ""}`} onClick={() => setAiOpen(!aiOpen)} title="Ask AI about the selection">
          ✦ AI
        </button>
        {aiOpen && (
          <div className="ai-menu">
            {INLINE_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setAiOpen(false);
                  onAi(a.id);
                }}
              >
                <span className="slash-title">{a.label}</span>
                <span className="slash-hint">{a.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="sep" />
      <button className={active.cloze ? "on cloze-btn" : "cloze-btn"} onClick={() => editor.chain().focus().toggleCloze().run()} title="Hide this in review (Ctrl+Shift+C)">
        {active.cloze ? "Un-quiz" : "Quiz me"}
      </button>
      <span className="sep" />
      <button className={active.bold ? "on" : ""} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
        <b>B</b>
      </button>
      <button className={active.italic ? "on" : ""} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
        <i>I</i>
      </button>
      <button className={active.code ? "on" : ""} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code (Ctrl+E)">
        {"</>"}
      </button>
    </BubbleMenu>
  );
}
