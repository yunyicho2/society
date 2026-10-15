-- 선생님별 설정 (카드 숨기기·순서, 과목 별칭, 진도 마무리일, 내 바로가기, 시간표 수정 칸)
CREATE TABLE IF NOT EXISTS prefs (
  email TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 차시 진도표 단원·학습 내용 (선생님·과목별)
CREATE TABLE IF NOT EXISTS plan_notes (
  email TEXT NOT NULL,
  subj TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, subj)
);

-- 쓰기 기록 (학생 정보 없음)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);

-- AI 하루 사용량
CREATE TABLE IF NOT EXISTS ai_usage (
  email TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, day, kind)
);

-- 규정 챗봇 문서와 조각 (벡터는 Vectorize, 원문 조각은 여기)
CREATE TABLE IF NOT EXISTS rag_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  chunks INTEGER NOT NULL,
  uploaded_by TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rag_chunks_doc ON rag_chunks (doc_id);
