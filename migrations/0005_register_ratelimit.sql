-- Migration number: 0005 	 register rate limiting
ALTER TABLE agents ADD COLUMN ip_hash TEXT;
CREATE INDEX idx_agents_ip_time ON agents(ip_hash, created_at);
