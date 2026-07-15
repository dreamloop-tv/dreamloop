-- Migration number: 0002 	 pipeline provenance
ALTER TABLE videos ADD COLUMN pipeline TEXT NOT NULL DEFAULT '';
