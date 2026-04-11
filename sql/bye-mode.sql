DO $$ BEGIN
  ALTER TABLE tournaments ADD COLUMN bye_mode TEXT DEFAULT 'handicap' CHECK (bye_mode IN ('handicap', 'random'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
