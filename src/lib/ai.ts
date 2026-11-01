import { isTauri } from "./db";
import { getSetting } from "./settings";

export type Provider = "claude-cli" | "openrouter";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  provider: Provider;
  model: string | null;
  system: string;
  messages: ChatMessage[];
}

type AiEvent = { type: "delta"; text: string } | { type: "done" } | { type: "error"; message: string };

export interface Stream {
  /** Resolves with the full text; rejects with the backend's error message. */
  done: Promise<string>;
  cancel(): void;
}

/** Call a Rust command: Tauri IPC in the app, the Vite dev bridge in a plain browser. */
export async function native<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  const res = await fetch(`/__dev/invoke/${cmd}`, { method: "POST", body: JSON.stringify(args) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export function streamChat(req: ChatRequest, onText: (full: string) => void): Stream {
  let full = "";
  let cancel = () => {};
  const done = new Promise<string>((resolve, reject) => {
    const handle = (e: AiEvent) => {
      if (e.type === "delta") {
        full += e.text;
        onText(full);
      } else if (e.type === "done") resolve(full);
      else reject(new Error(e.message));
    };
    (isTauri ? viaTauri : viaDevBridge)(req, handle, (c) => (cancel = c)).catch((err) => reject(err));
  });
  return { done, cancel: () => cancel() };
}

async function viaTauri(req: ChatRequest, handle: (e: AiEvent) => void, setCancel: (c: () => void) => void) {
  const { invoke, Channel } = await import("@tauri-apps/api/core");
  const requestId = crypto.randomUUID();
  const onEvent = new Channel<AiEvent>();
  onEvent.onmessage = handle;
  setCancel(() => {
    void invoke("ai_cancel", { requestId });
    handle({ type: "done" });
  });
  await invoke("ai_stream", { requestId, request: req, onEvent });
}

async function viaDevBridge(req: ChatRequest, handle: (e: AiEvent) => void, setCancel: (c: () => void) => void) {
  const ctrl = new AbortController();
  setCancel(() => {
    ctrl.abort();
    handle({ type: "done" });
  });
  const res = await fetch("/__dev/ai", { method: "POST", body: JSON.stringify(req), signal: ctrl.signal });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    return handle({ type: "error", message: body.error ?? `Dev bridge error ${res.status}` });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) handle(JSON.parse(line));
      }
    }
  } catch (err) {
    if (!ctrl.signal.aborted) throw err;
  }
}

// ---- which provider/model to use for what ----

export type AiPurpose = "inline" | "tutor";

export async function requestFor(purpose: AiPurpose, system: string, messages: ChatMessage[]): Promise<ChatRequest> {
  const provider = ((await getSetting("ai.provider")) as Provider | null) ?? "claude-cli";
  const model = (await getSetting(`ai.${provider}.model.${purpose}`)) || null;
  return { provider, model, system, messages };
}

/** One-shot helper: build the request from settings and stream it. */
export async function ask(purpose: AiPurpose, system: string, messages: ChatMessage[], onText: (full: string) => void) {
  return streamChat(await requestFor(purpose, system, messages), onText);
}
