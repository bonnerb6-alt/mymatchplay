-- Add round_deadlines JSON column to tournaments
-- Stores deadlines per round as {"1": "2026-04-18", "2": "2026-05-02", ...}
DO $$ BEGIN
  ALTER TABLE tournaments ADD COLUMN round_deadlines JSONB DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
