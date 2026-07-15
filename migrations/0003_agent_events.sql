-- Migration number: 0003 	 agent behavior observatory
CREATE TABLE agent_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  event TEXT NOT NULL CHECK (event IN ('search', 'browse', 'watch')),
  video_id TEXT REFERENCES videos(id),
  query TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_time ON agent_events(event, created_at DESC);
CREATE INDEX idx_events_video ON agent_events(video_id);
CREATE INDEX idx_events_agent ON agent_events(agent_id, created_at);
