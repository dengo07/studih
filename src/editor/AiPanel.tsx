import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ask, type Stream } from "../lib/ai";
import { renderMarkdown, markdownToEditorHtml } from "../lib/markdown";
import { INLINE_ACTIONS, inlineSystem, inlineUserMessage, parseCardsJson, type InlineAction } from "../lib/prompts";
import { addFreeCards } from "../lib/cardsRepo";
import { getSetting, setSetting } from "../lib/settings";
import { useApp } from "../store";
import RichText from "../components/RichText";

export interface AiTask {
  action: InlineAction;
  selection: string;
  from: number;
  to: number;
  /** Position inside the editor wrapper, in px. */
  top: number;
}

export interface NoteContext {
  noteId: string;
  title: string;
  subject?: string;
}

interface Props {
  editor: Editor;
  task: AiTask;
  context: NoteContext;
  onClose(): void;
}

export default function AiPanel({ editor, task, context, onClose }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"input" | "streaming" | "done" | "error">(task.action === "check" ? "input" : "streaming");
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [lang, setLang] = useState<string | null>(task.action === "translate" ? null : "English");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [savedCards, setSavedCards] = useState(0);
  const stream = useRef<Stream | null>(null);
  const label = INLINE_ACTIONS.find((a) => a.id === task.action)?.label;

  const run = async (opts: { studentAnswer?: string; lang?: string } = {}) => {
    stream.current?.cancel();
    setText("");
    setError("");
    setStatus("streaming");
    try {
      const s = await ask(
        "inline",
        inlineSystem(task.action, { subject: context.subject, lang: opts.lang ?? lang ?? "English" }),
        [
          {
            role: "user",
            content: inlineUserMessage({
              noteTitle: context.title,
              noteText: editor.getText({ blockSeparator: "\n" }),
              selection: task.selection,
              studentAnswer: opts.studentAnswer,
            }),
          },
        ],
        setText,
      );
      stream.current = s;
      const full = await s.done;
      if (task.action === "cards") setPicked(new Set(parseCardsJson(full).map((_, i) => i)));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    if (task.action === "translate") {
      getSetting("ai.translateTo").then((l) => {
        const target = l || "English";
        setLang(target);
        void run({ lang: target });
      });
    } else if (task.action !== "check") {
      void run();
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stream.current?.cancel();
    };
    // one panel per task
  }, []);

  const close = () => {
    stream.current?.cancel();
    onClose();
  };

  const insertBelow = () => {
    const $to = editor.state.doc.resolve(Math.min(task.to, editor.state.doc.content.size));
    const pos = $to.depth >= 1 ? $to.after(1) : editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(pos, markdownToEditorHtml(text)).run();
    close();
  };

  const replace = () => {
    let html = markdownToEditorHtml(text);
    const single = html.trim().match(/^<p>([\s\S]*)<\/p>$/);
    if (single && !single[1].includes("<p>")) html = single[1]; // keep it inline
    editor.chain().focus().insertContentAt({ from: task.from, to: task.to }, html).run();
    close();
  };

  const cards = task.action === "cards" && status === "done" ? parseCardsJson(text) : [];

  const saveCards = async () => {
    const chosen = cards.filter((_, i) => picked.has(i));
    await addFreeCards(context.noteId, chosen);
    await useApp.getState().refreshDue();
    setSavedCards(chosen.length);
  };

  return (
    <div className="ai-panel" style={{ top: task.top }} contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>
      <div className="ai-panel-head">
        <span className="ai-spark">✦</span>
        <span className="font-medium">{label}</span>
        {task.action === "translate" && lang !== null && (
          <>
            <span className="text-faint">to</span>
            <input
              className="ai-lang"
              defaultValue={lang}
              onKeyDown={(e) => {
                const l = e.currentTarget.value.trim();
                if (e.key === "Enter" && l) {
                  setLang(l);
                  void setSetting("ai.translateTo", l);
                  void run({ lang: l });
                }
              }}
              title="Target language. Press Enter to retranslate."
            />
          </>
        )}
        <button className="ml-auto text-faint hover:text-fg" onClick={close} title="Close (Esc)">
          ×
        </button>
      </div>

      <blockquote className="ai-quote">{task.selection.length > 220 ? `${task.selection.slice(0, 220)}…` : task.selection}</blockquote>

      {status === "input" && (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            className="ai-input"
            rows={4}
            placeholder="Explain this passage in your own words, as if teaching a friend…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && answer.trim()) void run({ studentAnswer: answer });
            }}
          />
          <button className="ai-primary self-end" disabled={!answer.trim()} onClick={() => run({ studentAnswer: answer })}>
            Check my explanation <kbd>Ctrl ↵</kbd>
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="ai-error">
          {error}
          <button className="ml-2 underline" onClick={() => run({ studentAnswer: answer || undefined })}>
            Retry
          </button>
        </div>
      )}

      {(status === "streaming" || status === "done") && task.action !== "cards" && (
        <div className="ai-body md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text || "…") }} />
      )}

      {task.action === "cards" && status === "streaming" && <div className="ai-body text-faint">Writing cards… {text.length > 0 && `(${text.length} chars)`}</div>}

      {cards.length > 0 && (
        <ul className="ai-cards">
          {cards.map((c, i) => (
            <li key={i}>
              <label>
                <input
                  type="checkbox"
                  checked={picked.has(i)}
                  disabled={savedCards > 0}
                  onChange={() => {
                    const next = new Set(picked);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    setPicked(next);
                  }}
                />
                <span>
                  <RichText text={c.front} className="block font-medium" />
                  <RichText text={c.back} className="block text-muted" />
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {task.action === "cards" && status === "done" && cards.length === 0 && (
        <div className="ai-error">Couldn't read cards from the reply. Try again.</div>
      )}

      <div className="ai-actions">
        {status === "streaming" && (
          <button onClick={() => stream.current?.cancel()} className="ai-ghost">
            Stop
          </button>
        )}
        {status === "done" && task.action === "cards" && (
          savedCards ? (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">✓ Saved {savedCards} cards to review</span>
          ) : (
            <button className="ai-primary" disabled={!picked.size} onClick={saveCards}>
              Save {picked.size} cards
            </button>
          )
        )}
        {status === "done" && task.action !== "cards" && (
          <>
            {task.action !== "check" && (
              <button className="ai-primary" onClick={insertBelow}>
                Insert below
              </button>
            )}
            {(task.action === "simplify" || task.action === "translate") && (
              <button className="ai-ghost" onClick={replace}>
                Replace selection
              </button>
            )}
            <button className="ai-ghost" onClick={() => navigator.clipboard.writeText(text)}>
              Copy
            </button>
          </>
        )}
        {status === "done" && (
          <button className="ai-ghost ml-auto" onClick={() => (task.action === "check" ? setStatus("input") : run())}>
            {task.action === "check" ? "Try again" : "Regenerate"}
          </button>
        )}
      </div>
    </div>
  );
}
