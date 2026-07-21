-- Migration number: 0006 	 door log (who reads the agent onboarding docs)
CREATE TABLE door_log (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  ua_class TEXT NOT NULL,
  ua TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_door_time ON door_log(created_at);
CREATE INDEX idx_door_class ON door_log(ua_class, created_at);
