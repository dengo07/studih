import migration001 from "../../src-tauri/migrations/001_init.sql?raw";
import migration002 from "../../src-tauri/migrations/002_plan_kind.sql?raw";

/** Minimal SQL surface shared by the Tauri (sqlx) driver and the WASM fallback. Use `?` placeholders. */
export interface Db {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

export const DB_URL = "sqlite:studih.db";
export const MIGRATIONS = [migration001, migration002];

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  dbPromise ??= isTauri ? openTauriDb() : openWasmDb({ persist: true });
  return dbPromise;
}

/** Test hook: swap in a fresh in-memory database. */
export function setDb(db: Db) {
  dbPromise = Promise.resolve(db);
}

async function openTauriDb(): Promise<Db> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  // Migrations run in Rust (see src-tauri/src/lib.rs) when the plugin preloads this URL.
  const conn = await Database.load(DB_URL);
  return {
    select: (sql, params = []) => conn.select(sql, params),
    execute: async (sql, params = []) => {
      await conn.execute(sql, params);
    },
  };
}

/**
 * Browser/test fallback using the official SQLite WASM build (has FTS5, unlike sql.js).
 * In a browser it persists to localStorage via kvvfs, which is fine for UI previews.
 */
export async function openWasmDb({ persist }: { persist: boolean }): Promise<Db> {
  const { default: sqlite3InitModule } = await import("@sqlite.org/sqlite-wasm");
  const sqlite3 = await sqlite3InitModule();
  const db =
    persist && sqlite3.oo1.JsStorageDb
      ? new sqlite3.oo1.JsStorageDb("local")
      : new sqlite3.oo1.DB(":memory:");

  db.exec("PRAGMA foreign_keys = ON");
  const version = db.selectValue("PRAGMA user_version") as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
  }

  return {
    select: async <T>(sql: string, params: unknown[] = []) =>
      db.selectObjects(sql, params as never) as T[],
    execute: async (sql, params = []) => {
      db.exec({ sql, bind: params as never });
    },
  };
}
