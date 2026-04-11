-- Add scheduled date/time to matches
ALTER TABLE matches ADD COLUMN scheduled_at TIMESTAMPTZ;
