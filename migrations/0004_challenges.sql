-- Migration number: 0004 	 reverse captcha challenges
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  answer TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_ok INTEGER NOT NULL DEFAULT 0,
  answered_at TEXT,
  used_at TEXT
);
CREATE INDEX idx_challenges_agent ON challenges(agent_id, issued_at);
