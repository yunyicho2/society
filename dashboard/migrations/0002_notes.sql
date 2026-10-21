-- 내 메모 (선생님 본인만 보고 고침)
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS notes_email ON notes (email, pinned, updated_at);
