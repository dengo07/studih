# Studih

A desktop study app built around your notes. Everything stays local (SQLite in the app's data folder).

- **Notes that quiz you.** Select text → **Quiz me** (Ctrl+Shift+C) turns it into a cloze card. Vocabulary tables turn each row into a card. Cards come back on an FSRS spaced-repetition schedule (**Review**). **Quiz mode** blurs the hidden parts right inside the note.
- **Rich blocks** (type `/`): LaTeX math (`$x^2$` inline, `$$` + space for a block), runnable Python/JavaScript, vocabulary tables.
- **Linked knowledge graph.** Type `[[` to link or create a note. Each note shows its backlinks; **Graph** shows how everything connects, faded where you know it least.
- **AI** (Claude Code CLI or OpenRouter): select text → **✦ AI** to explain, simplify, give an example, translate, make cards, or check your own explanation. **Tutor** (Ctrl+J) chats over the current note and the notes it links to, in Explain, Socratic, or Quiz mode.
- **Focus timer, planner, stats.** A Pomodoro timer in the sidebar, an exam planner that spreads topics over the days left (weak notes get more time) and rebalances missed sessions, and a stats page.

## Setup (Linux)

System libraries for Tauri (one time):

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Then:

```bash
npm install
npm run tauri dev      # run the desktop app
npm run tauri build    # build an installable bundle
```

**AI:** with the default provider, Studih runs your installed `claude` CLI headlessly (no tools or MCP servers, in an empty temp directory) using your existing login. To use OpenRouter instead, pick it in **Settings** and paste an API key. It's stored in the system keyring, never in the database.

## Development

```bash
npm test                                              # frontend tests (vitest, real SQLite via WASM)
cargo test --manifest-path src-tauri/Cargo.toml -p studih-core            # Rust AI/keyring tests
cargo test --manifest-path src-tauri/Cargo.toml -p studih-core -- --ignored   # + live Claude CLI round trip
```

`npm run dev` also runs the UI in a plain browser: the database falls back to SQLite WASM (stored in localStorage), and AI calls go through a dev-only Vite middleware to `studih-ai`, a small binary built from the same Rust crate:

```bash
cargo build --manifest-path src-tauri/Cargo.toml -p studih-core --bin studih-ai
npm run dev
```

## Layout

- `src/editor/`: TipTap editor and its extensions (math, runnable code, vocab, cloze, wiki-links, slash menu, AI panel)
- `src/features/`: notes, review, graph, tutor, planner, focus timer, stats, settings
- `src/lib/`: database access (`db.ts` + `*Repo.ts`), FSRS, AI client, prompts, markdown
- `src-tauri/core/`: Rust crate for AI streaming (Claude CLI + OpenRouter) and the keyring; no webview dependency, so it builds and tests anywhere
- `src-tauri/src/lib.rs`: Tauri commands and plugins
- `src-tauri/migrations/`: SQL schema (shared by the app and the WASM fallback)
