import { getDb } from "./db";
import { newId } from "./repo";
import type { ChatMessage } from "./ai";

export interface Chat {
  id: string;
  title: string;
  provider: string;
  model: string | null;
  created_at: number;
}

export interface StoredMessage extends ChatMessage {
  id: string;
  context_note_ids: string | null;
  created_at: number;
}

export async function listChats(limit = 30) {
  const db = await getDb();
  return db.select<Chat>("SELECT * FROM chats ORDER BY created_at DESC LIMIT ?", [limit]);
}

export async function createChat(title: string, provider: string, model: string | null): Promise<Chat> {
  const db = await getDb();
  const chat = { id: newId(), title, provider, model, created_at: Date.now() };
  await db.execute("INSERT INTO chats (id, title, provider, model, created_at) VALUES (?, ?, ?, ?, ?)", [
    chat.id, chat.title, chat.provider, chat.model, chat.created_at,
  ]);
  return chat;
}

export async function chatMessages(chatId: string) {
  const db = await getDb();
  return db.select<StoredMessage>(
    "SELECT id, role, content, context_note_ids, created_at FROM chat_messages WHERE chat_id = ? ORDER BY created_at, rowid",
    [chatId],
  );
}

export async function addChatMessage(chatId: string, msg: ChatMessage, contextNoteIds: string[] = []) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO chat_messages (id, chat_id, role, content, context_note_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [newId(), chatId, msg.role, msg.content, JSON.stringify(contextNoteIds), Date.now()],
  );
}

export async function deleteChat(id: string) {
  const db = await getDb();
  await db.execute("DELETE FROM chats WHERE id = ?", [id]);
}

/** Notes linked from or to `noteId`, for default tutor context. */
export async function linkedNoteIds(noteId: string) {
  const db = await getDb();
  const rows = await db.select<{ id: string }>(
    "SELECT to_note AS id FROM links WHERE from_note = ? UNION SELECT from_note FROM links WHERE to_note = ?",
    [noteId, noteId],
  );
  return rows.map((r) => r.id);
}

export async function noteTexts(ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db.select<{ id: string; title: string; text: string }>(
    `SELECT id, title, plain_text AS text FROM notes WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  // keep caller's order (current note first)
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
}
