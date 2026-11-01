export interface RunResult {
  stdout: string;
  stderr: string;
  error?: string;
  ms: number;
}

export const RUNNABLE = new Set(["python", "javascript"]);

const PY_TIMEOUT_MS = 15_000;
const JS_TIMEOUT_MS = 5_000;

export function runCode(language: string, code: string, onStatus?: (s: string) => void): Promise<RunResult> {
  if (language === "python") return runPython(code, onStatus);
  if (language === "javascript") return runJs(code);
  return Promise.resolve({ stdout: "", stderr: "", error: `Running ${language} isn't supported yet.`, ms: 0 });
}

// ---- Python: one long-lived worker (Pyodide is slow to boot), replaced if a run times out ----

let pyWorker: Worker | null = null;
let nextId = 1;

function getPyWorker() {
  pyWorker ??= new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });
  return pyWorker;
}

function runPython(code: string, onStatus?: (s: string) => void): Promise<RunResult> {
  const worker = getPyWorker();
  const id = nextId++;
  const t0 = performance.now();
  onStatus?.("Loading Python…");

  return new Promise((resolve) => {
    let timer: number | undefined;
    const onMessage = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      if (e.data.type === "started") {
        onStatus?.("Running…");
        // only start the clock once Pyodide is loaded, so the first-run download isn't counted
        timer = window.setTimeout(() => {
          worker.removeEventListener("message", onMessage);
          worker.terminate();
          pyWorker = null;
          resolve({ stdout: "", stderr: "", error: `Timed out after ${PY_TIMEOUT_MS / 1000}s (infinite loop?)`, ms: PY_TIMEOUT_MS });
        }, PY_TIMEOUT_MS);
        return;
      }
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      resolve({ stdout: e.data.stdout, stderr: e.data.stderr, error: e.data.error, ms: performance.now() - t0 });
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, code });
  });
}

// ---- JavaScript: a throwaway worker per run, so user code can't touch the app ----

const JS_PRELUDE = `
const __out = [];
const __fmt = (a) => a.map((x) => typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })()).join(" ");
console.log = console.info = console.debug = (...a) => __out.push(__fmt(a));
console.error = console.warn = (...a) => __out.push("⚠ " + __fmt(a));
self.onmessage = async (e) => {
  try {
    const result = await (async () => eval(e.data))();
    if (result !== undefined) __out.push("→ " + __fmt([result]));
    postMessage({ stdout: __out.join("\\n") });
  } catch (err) {
    postMessage({ stdout: __out.join("\\n"), error: String(err) });
  }
};`;

function runJs(code: string): Promise<RunResult> {
  const url = URL.createObjectURL(new Blob([JS_PRELUDE], { type: "text/javascript" }));
  const worker = new Worker(url);
  const t0 = performance.now();
  return new Promise((resolve) => {
    const finish = (r: Omit<RunResult, "ms">) => {
      window.clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ ...r, ms: performance.now() - t0 });
    };
    const timer = window.setTimeout(
      () => finish({ stdout: "", stderr: "", error: `Timed out after ${JS_TIMEOUT_MS / 1000}s (infinite loop?)` }),
      JS_TIMEOUT_MS,
    );
    worker.onmessage = (e) => finish({ stdout: e.data.stdout ?? "", stderr: "", error: e.data.error });
    worker.onerror = (e) => finish({ stdout: "", stderr: "", error: e.message });
    worker.postMessage(code);
  });
}
