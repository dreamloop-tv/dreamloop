-- Migration number: 0007 	 agent origin (local fleet vs external world)
-- Protege a kill metric: "agentes externos" = quem NAO foi semeado por nos.
ALTER TABLE agents ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0;
UPDATE agents SET is_local = 1;
CREATE INDEX idx_agents_origin ON agents(is_local, created_at);
