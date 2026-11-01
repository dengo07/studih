/// <reference lib="webworker" />
// Runs Python in WASM. Pyodide is fetched from the CDN on first use and then cached by the webview.

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

interface PyodideApi {
  runPythonAsync(code: string): Promise<unknown>;
  loadPackagesFromImports(code: string): Promise<void>;
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
}

let pyodide: Promise<PyodideApi> | null = null;

function load() {
  pyodide ??= (async () => {
    const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`);
    return (await loadPyodide({ indexURL: PYODIDE_URL })) as PyodideApi;
  })();
  return pyodide;
}

self.onmessage = async (e: MessageEvent<{ id: number; code: string }>) => {
  const { id, code } = e.data;
  const out: string[] = [];
  const err: string[] = [];
  try {
    const py = await load();
    self.postMessage({ id, type: "started" });
    py.setStdout({ batched: (s) => out.push(s) });
    py.setStderr({ batched: (s) => err.push(s) });
    await py.loadPackagesFromImports(code);
    const result = await py.runPythonAsync(code);
    if (result !== undefined && result !== null) out.push(String(result));
    self.postMessage({ id, type: "done", stdout: out.join("\n"), stderr: err.join("\n") });
  } catch (ex) {
    self.postMessage({ id, type: "done", stdout: out.join("\n"), stderr: err.join("\n"), error: String(ex) });
  }
};
