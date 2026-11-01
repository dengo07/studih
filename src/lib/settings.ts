import { getDb } from "./db";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export async function getSettings(prefix: string): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE ?", [`${prefix}%`]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
