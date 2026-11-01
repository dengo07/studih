import { useEffect, useMemo, useRef, useState } from "react";
import { ask, requestFor, type ChatMessage, type Stream } from "../../lib/ai";
import { renderMarkdown } from "../../lib/markdown";
import { TUTOR_MODES, tutorSystem, type TutorMode } from "../../lib/prompts";
import { addChatMessage, chatMessages, createChat, linkedNoteIds, listChats, noteTexts, type Chat } from "../../lib/chatsRepo";
import { fuzzyFilter } from "../../lib/fuzzy";
import { useApp } from "../../store";

export default function TutorPanel() {
  const notes = useApp((s) => s.notes);
  const subjects = useApp((s) => s.subjects);
  const currentNoteId = useApp((s) => (s.view === "notes" ? s.selectedNoteId : null));
  const setTutorOpen = useApp((s) => s.setTutorOpen);

  const [mode, setMode] = useState<TutorMode>("explain");
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<string | null>(null);
  const [history, setHistory] = useState<Chat[] | null>(null);
  const stream = useRef<Stream | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // a fresh chat follows the open note (plus its links); an ongoing one keeps its context
  useEffect(() => {
    if (messages.length || !currentNoteId) return;
    linkedNoteIds(currentNoteId).then((ids) => setContextIds([currentNoteId, ...ids.slice(0, 5)]));
  }, [currentNoteId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, streaming]);

  useEffect(() => () => stream.current?.cancel(), []);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming !== null) return;
    setInput("");
    setError("");
    const history = [...messages, { role: "user" as const, content }];
    setMessages(history);
    setStreaming("");
    try {
      let c = chat;
      if (!c) {
        const req = await requestFor("tutor", "", []);
        c = await createChat(content.slice(0, 60), req.provider, req.model);
        setChat(c);
      }
      await addChatMessage(c.id, { role: "user", content }, contextIds);
      const system = tutorSystem(mode, await noteTexts(contextIds));
      const s = await ask("tutor", system, history, setStreaming);
      stream.current = s;
      const reply = await s.done;
      if (reply.trim()) {
        await addChatMessage(c.id, { role: "assistant", content: reply }, contextIds);
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(null);
      stream.current = null;
    }
  };

  const newChat = () => {
    stream.current?.cancel();
    setChat(null);
    setMessages([]);
    setError("");
    if (currentNoteId) linkedNoteIds(currentNoteId).then((ids) => setContextIds([currentNoteId, ...ids.slice(0, 5)]));
  };

  const openChat = async (c: Chat) => {
    const msgs = await chatMessages(c.id);
    setChat(c);
    setMessages(msgs.map(({ role, content }) => ({ role, content })));
    const lastCtx = msgs.findLast((m) => m.context_note_ids)?.context_note_ids;
    if (lastCtx) setContextIds(JSON.parse(lastCtx));
    setHistory(null);
  };

  const noteById = (id: string) => notes.find((n) => n.id === id);
  const colorOf = (id: string) => subjects.find((s) => s.id === noteById(id)?.subject_id)?.color ?? "var(--faint)";
  const pickerResults = useMemo(
    () => (picker === null ? [] : fuzzyFilter(notes.filter((n) => !contextIds.includes(n.id)), picker, (n) => n.title || "Untitled", 6)),
    [picker, notes, contextIds],
  );

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-[#a855f7]">✦</span>
        <h2 className="font-semibold">Tutor</h2>
        <div className="relative ml-auto flex items-center gap-1 text-sm">
          <button className="rounded-md px-2 py-0.5 text-muted hover:bg-hover" onClick={async () => setHistory(history ? null : await listChats())}>
            History
          </button>
          <button className="rounded-md px-2 py-0.5 text-muted hover:bg-hover" onClick={newChat}>
            New
          </button>
          <button className="rounded-md px-2 py-0.5 text-faint hover:bg-hover" onClick={() => setTutorOpen(false)} title="Close (Ctrl+J)">
            ×
          </button>
          {history && (
            <div className="absolute top-full right-0 z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-xl">
              {history.length === 0 && <div className="p-3 text-sm text-faint">No chats yet</div>}
              {history.map((c) => (
                <button key={c.id} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover" onClick={() => openChat(c)}>
                  {c.title}
                  <span className="block text-xs text-faint">{new Date(c.created_at).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex gap-1 border-b border-line px-3 py-2">
        {TUTOR_MODES.map((m) => (
          <button
            key={m.id}
            title={m.hint}
            onClick={() => setMode(m.id)}
            className={`flex-1 rounded-md py-1 text-xs font-medium ${mode === m.id ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2 text-xs">
        <span className="mr-1 text-faint">Context:</span>
        {contextIds.map((id) => (
          <span key={id} className="flex items-center gap-1 rounded-full bg-raised py-0.5 pr-1 pl-2 ring-1 ring-line">
            <span className="size-1.5 rounded-full" style={{ background: colorOf(id) }} />
            <span className="max-w-32 truncate">{noteById(id)?.title || "Untitled"}</span>
            <button className="px-0.5 text-faint hover:text-red-500" onClick={() => setContextIds(contextIds.filter((x) => x !== id))}>
              ×
            </button>
          </span>
        ))}
        <span className="relative">
          {picker === null ? (
            <button className="rounded-full px-2 py-0.5 text-faint ring-1 ring-line ring-dashed hover:text-fg" onClick={() => setPicker("")}>
              + note
            </button>
          ) : (
            <>
              <input
                autoFocus
                value={picker}
                onChange={(e) => setPicker(e.target.value)}
                onBlur={() => setTimeout(() => setPicker(null), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setPicker(null);
                  if (e.key === "Enter" && pickerResults[0]) {
                    setContextIds([...contextIds, pickerResults[0].id]);
                    setPicker(null);
                  }
                }}
                placeholder="Find a note…"
                className="w-32 rounded-full bg-raised px-2 py-0.5 ring-1 ring-accent outline-none"
              />
              {pickerResults.length > 0 && (
                <div className="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-line bg-raised p-1 shadow-xl">
                  {pickerResults.map((n) => (
                    <button
                      key={n.id}
                      className="block w-full truncate rounded px-2 py-1 text-left hover:bg-hover"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setContextIds([...contextIds, n.id]);
                        setPicker(null);
                      }}
                    >
                      {n.title || "Untitled"}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </span>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && streaming === null && (
          <div className="mt-8 text-center text-sm text-muted">
            <p className="mb-3">{TUTOR_MODES.find((m) => m.id === mode)?.hint}. I can see the notes listed under Context.</p>
            {mode === "quiz" ? (
              <button className="ai-primary" onClick={() => send("Start the quiz.")}>
                Start quiz
              </button>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                {(mode === "socratic"
                  ? ["Help me understand this topic step by step", "I'm stuck on why this works"]
                  : ["Summarize the key ideas", "What should I memorize here?", "Explain the hardest part"]
                ).map((q) => (
                  <button key={q} className="rounded-full px-3 py-1 text-xs ring-1 ring-line hover:bg-hover" onClick={() => send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
        ))}
        {streaming !== null && <Bubble role="assistant" content={streaming || "…"} />}
        {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl bg-raised p-2 ring-1 ring-line focus-within:ring-accent">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={Math.min(6, Math.max(1, input.split("\n").length))}
            placeholder={mode === "quiz" ? "Your answer…" : "Ask about your notes…"}
            className="flex-1 resize-none bg-transparent px-1 text-sm outline-none"
          />
          {streaming !== null ? (
            <button className="ai-ghost" onClick={() => stream.current?.cancel()}>
              Stop
            </button>
          ) : (
            <button className="ai-primary" disabled={!input.trim()} onClick={() => send(input)}>
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Bubble({ role, content }: ChatMessage) {
  if (role === "user") {
    return <div className="ml-10 rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm whitespace-pre-wrap text-white">{content}</div>;
  }
  return <div className="md mr-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />;
}
