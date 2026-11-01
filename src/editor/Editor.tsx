import { useRef, useState, type RefObject } from "react";
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/react";
import { getTextBetween, getTextSerializersFromSchema } from "@tiptap/core";
import { MathBlock, MathInline } from "./extensions/Math";
import { CodeRunBlock } from "./extensions/CodeRunBlock";
import { VocabTable } from "./extensions/VocabTable";
import { SlashMenu } from "./extensions/SlashMenu";
import { ClozeMark } from "./extensions/ClozeMark";
import { WikiLink } from "./extensions/WikiLink";
import SelectionMenu from "./SelectionMenu";
import AiPanel, { type AiTask, type NoteContext } from "./AiPanel";
import type { InlineAction } from "../lib/prompts";

export interface EditorChange {
  docJson: string;
  plainText: string;
}

interface Props {
  initialDoc: JSONContent;
  onChange(change: EditorChange): void;
  editorRef?: RefObject<TiptapEditor | null>;
  context: NoteContext;
}

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/** Rich-text editor for one note. Remount (via `key`) to switch notes. */
export default function Editor({ initialDoc, onChange, editorRef, context }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [aiTask, setAiTask] = useState<AiTask | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing…  type / for blocks, [[ to link, $x^2$ for math" }),
      MathInline,
      MathBlock,
      CodeRunBlock,
      VocabTable,
      SlashMenu,
      ClozeMark,
      WikiLink,
    ],
    content: initialDoc.content?.length ? initialDoc : EMPTY_DOC,
    onUpdate: ({ editor }) => {
      onChangeRef.current({
        docJson: JSON.stringify(editor.getJSON()),
        plainText: editor.getText({ blockSeparator: "\n" }),
      });
    },
  });

  if (editorRef) editorRef.current = editor;

  const startAi = (action: InlineAction) => {
    if (!editor || !wrapper.current) return;
    const { from, to } = editor.state.selection;
    // use each node's renderText so math ($…$) and [[links]] survive into the prompt
    const selection = getTextBetween(editor.state.doc, { from, to }, {
      blockSeparator: "\n",
      textSerializers: getTextSerializersFromSchema(editor.schema),
    });
    const coords = editor.view.coordsAtPos(to);
    const top = coords.bottom - wrapper.current.getBoundingClientRect().top + 10;
    setAiTask({ action, selection, from, to, top });
  };

  return (
    <div ref={wrapper} className="relative">
      <EditorContent editor={editor} />
      {editor && <SelectionMenu editor={editor} onAi={startAi} />}
      {editor && aiTask && (
        <AiPanel key={`${aiTask.from}-${aiTask.action}`} editor={editor} task={aiTask} context={context} onClose={() => setAiTask(null)} />
      )}
    </div>
  );
}
