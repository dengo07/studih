import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

/**
 * Dev-server-only stand-in for the Tauri backend, so the UI can run in a normal browser.
 * Forwards to `studih-ai`, a tiny binary built from the same Rust crate the app uses.
 */
const BIN = path.resolve(__dirname, "src-tauri/target/debug/studih-ai");

const COMMANDS: Record<string, { sub: string; stdin?: (args: Record<string, unknown>) => string }> = {
  openrouter_key_status: { sub: "key-status" },
  set_openrouter_key: { sub: "set-key", stdin: (a) => String(a.key ?? "") },
  claude_cli_version: { sub: "claude-version" },
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function fail(res: ServerResponse, status: number, message: string) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

export function devNativeBridge(): Plugin {
  return {
    name: "studih-dev-native-bridge",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__dev/") || req.method !== "POST") return next();
        if (!existsSync(BIN)) {
          return fail(res, 500, "Dev AI bridge not built. Run: cargo build --manifest-path src-tauri/Cargo.toml -p studih-core --bin studih-ai");
        }
        const body = await readBody(req);

        if (req.url === "/__dev/ai") {
          const child = spawn(BIN, ["chat"], { stdio: ["pipe", "pipe", "inherit"] });
          res.setHeader("content-type", "application/x-ndjson");
          child.stdout.pipe(res);
          child.stdin.end(body);
          res.on("close", () => child.kill());
          return;
        }

        const cmd = COMMANDS[req.url.slice("/__dev/invoke/".length)];
        if (!cmd) return fail(res, 404, "unknown command");
        const args = body ? JSON.parse(body) : {};
        const child = spawn(BIN, [cmd.sub], { stdio: ["pipe", "pipe", "pipe"] });
        let out = "";
        let err = "";
        child.stdout.on("data", (c) => (out += c));
        child.stderr.on("data", (c) => (err += c));
        child.stdin.end(cmd.stdin?.(args) ?? "");
        child.on("close", (code) => {
          if (code !== 0) return fail(res, 500, err.trim() || `exit ${code}`);
          res.setHeader("content-type", "application/json");
          res.end(out.trim() || "null");
        });
      });
    },
  };
}
