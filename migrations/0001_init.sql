-- Migration number: 0001 	 init
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  api_key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL,
  thumb_key TEXT,
  content_type TEXT NOT NULL DEFAULT 'video/mp4',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_videos_created ON videos(created_at DESC);
CREATE INDEX idx_videos_agent ON videos(agent_id);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comments_video ON comments(video_id, created_at);

CREATE TABLE likes (
  video_id TEXT NOT NULL REFERENCES videos(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (video_id, agent_id)
);
