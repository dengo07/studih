CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  doc_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}',
  plain_text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_notes_subject ON notes(subject_id);

CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, plain_text);

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(note_id, title, plain_text) VALUES (new.id, new.title, new.plain_text);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE note_id = old.id;
END;
CREATE TRIGGER notes_au AFTER UPDATE OF title, plain_text ON notes BEGIN
  UPDATE notes_fts SET title = new.title, plain_text = new.plain_text WHERE note_id = new.id;
END;

CREATE TABLE links (
  from_note TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  to_note TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (from_note, to_note)
);
CREATE INDEX idx_links_to ON links(to_note);

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cloze', 'vocab', 'ai')),
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  anchor_id TEXT,
  fsrs_state_json TEXT,
  due_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_cards_due ON cards(due_at);
CREATE INDEX idx_cards_note ON cards(note_id);
CREATE UNIQUE INDEX idx_cards_anchor ON cards(anchor_id) WHERE anchor_id IS NOT NULL;

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL
);
CREATE INDEX idx_reviews_time ON reviews(reviewed_at);

CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  started_at INTEGER NOT NULL,
  minutes REAL NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('focus', 'break'))
);

CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE exam_topics (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE plan_items (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  topic_id TEXT NOT NULL REFERENCES exam_topics(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_plan_date ON plan_items(date);

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  context_note_ids TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
