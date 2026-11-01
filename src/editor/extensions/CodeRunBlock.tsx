import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEffect, useRef, useState } from "react";
import { RUNNABLE, runCode, type RunResult } from "../../lib/runners";

export const LANGUAGES: Record<string, { label: string; ext: () => Extension }> = {
  python: { label: "Python", ext: python },
  javascript: { label: "JavaScript", ext: javascript },
  cpp: { label: "C / C++", ext: cpp },
  java: { label: "Java", ext: java },
  text: { label: "Plain text", ext: () => [] },
};

const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches;

function CodeRunView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language: string = node.attrs.language;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const run = async () => {
    const code = view.current?.state.doc.toString() ?? "";
    setResult(null);
    setRunning("Running…");
    const r = await runCode(language, code, setRunning);
    setRunning(null);
    setResult(r);
  };
  const runRef = useRef(run);
  runRef.current = run;

  // CodeMirror owns the text while mounted; we mirror it into the node attr for saving/search.
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: node.attrs.code,
        extensions: [
          basicSetup,
          langCompartment.current.of(LANGUAGES[language]?.ext() ?? []),
          prefersDark() ? oneDark : [],
          Prec.highest(
            keymap.of([
              { key: "Mod-Enter", run: () => (void runRef.current(), true) },
              { key: "Shift-Enter", run: () => (void runRef.current(), true) },
            ]),
          ),
          EditorView.editable.of(editor.isEditable),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) updateAttributes({ code: u.state.doc.toString() });
          }),
        ],
      }),
    });
    view.current = v;
    if (!node.attrs.code) v.focus();
    return () => v.destroy();
    // mount once per node view; later attr changes originate from this CodeMirror instance
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: langCompartment.current.reconfigure(LANGUAGES[language]?.ext() ?? []) });
  }, [language]);

  const canRun = RUNNABLE.has(language);

  return (
    <NodeViewWrapper className="code-run" data-drag-handle>
      <div className="code-run-bar" contentEditable={false}>
        <select value={language} onChange={(e) => updateAttributes({ language: e.target.value })}>
          {Object.entries(LANGUAGES).map(([id, l]) => (
            <option key={id} value={id}>
              {l.label}
            </option>
          ))}
        </select>
        {canRun && (
          <button onClick={run} disabled={!!running} title="Run (Ctrl+Enter)">
            {running ? running : "▶ Run"}
          </button>
        )}
        {result && (
          <button className="ghost" onClick={() => setResult(null)}>
            Clear output
          </button>
        )}
      </div>
      <div ref={host} className="code-run-editor" />
      {result && (
        <pre className={`code-run-output ${result.error ? "has-error" : ""}`}>
          {result.stdout}
          {result.stderr && <span className="stderr">{(result.stdout ? "\n" : "") + result.stderr}</span>}
          {result.error && <span className="err">{(result.stdout || result.stderr ? "\n" : "") + result.error}</span>}
          {!result.stdout && !result.stderr && !result.error && <span className="muted">(no output)</span>}
          <span className="time">{Math.round(result.ms)} ms</span>
        </pre>
      )}
    </NodeViewWrapper>
  );
}

export const CodeRunBlock = Node.create({
  name: "codeRun",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      language: { default: "python" },
      code: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre[data-code-run]",
        getAttrs: (el) => ({ language: (el as HTMLElement).dataset.language ?? "python", code: el.textContent ?? "" }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["pre", mergeAttributes(HTMLAttributes, { "data-code-run": "", "data-language": node.attrs.language }), node.attrs.code];
  },

  renderText({ node }) {
    return node.attrs.code;
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeRunView);
  },
});
