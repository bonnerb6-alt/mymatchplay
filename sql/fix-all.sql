-- ============================================
-- Fix All - Ensure all columns and tables exist
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================

-- 1. Members columns
DO $$ BEGIN
  ALTER TABLE members ADD COLUMN contact_preference TEXT NOT NULL DEFAULT 'whatsapp' CHECK (contact_preference IN ('whatsapp', 'sms', 'email'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE members ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Clubs columns
DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'trial' CHECK (payment_status IN ('trial', 'active', 'overdue', 'cancelled'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN stripe_payment_link TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN subscription_expires DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN contact_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN contact_email TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN contact_phone TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN notes TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN club_size INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN logo_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Tournaments columns
DO $$ BEGIN
  ALTER TABLE tournaments ADD COLUMN whatsapp_group_link TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Club memberships table
CREATE TABLE IF NOT EXISTS club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'golfer' CHECK (role IN ('golfer', 'organiser')),
  handicap INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_member ON club_memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_memberships_club ON club_memberships(club_id);

DO $$ BEGIN
  ALTER TABLE club_memberships ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE club_memberships ADD COLUMN member_type TEXT NOT NULL DEFAULT 'mens' CHECK (member_type IN ('mens', 'ladies'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. Club memberships RLS
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "memberships_select" ON club_memberships FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "memberships_insert" ON club_memberships FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "memberships_update" ON club_memberships FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "memberships_delete" ON club_memberships FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Membership requests table
CREATE TABLE IF NOT EXISTS membership_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT,
  requested_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_requests_club ON membership_requests(club_id);
CREATE INDEX IF NOT EXISTS idx_requests_member ON membership_requests(member_id);

ALTER TABLE membership_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "requests_select" ON membership_requests FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "requests_insert" ON membership_requests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "requests_update" ON membership_requests FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Migrate existing members into club_memberships (if not already done)
INSERT INTO club_memberships (member_id, club_id, role, handicap)
SELECT id, club_id, role, handicap FROM members WHERE club_id IS NOT NULL
ON CONFLICT (member_id, club_id) DO NOTHING;

-- 8. Make Brian Bonner admin + organiser
UPDATE members SET is_admin = true, role = 'organiser' WHERE email = 'bonnerb@btinternet.com';
UPDATE club_memberships SET role = 'organiser'
WHERE member_id = (SELECT id FROM members WHERE email = 'bonnerb@btinternet.com');

-- 9. Ensure RLS policies allow reads on all tables
-- (Some queries may fail if SELECT policies are missing or too restrictive)
DO $$ BEGIN
  DROP POLICY IF EXISTS "clubs_select" ON clubs;
  CREATE POLICY "clubs_select" ON clubs FOR SELECT USING (true);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "clubs_insert" ON clubs;
  CREATE POLICY "clubs_insert" ON clubs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "clubs_update" ON clubs;
  CREATE POLICY "clubs_update" ON clubs FOR UPDATE USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "members_select" ON members;
  CREATE POLICY "members_select" ON members FOR SELECT USING (true);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tournaments_select" ON tournaments;
  CREATE POLICY "tournaments_select" ON tournaments FOR SELECT USING (true);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "entries_select" ON tournament_entries;
  CREATE POLICY "entries_select" ON tournament_entries FOR SELECT USING (true);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "matches_select" ON matches;
  CREATE POLICY "matches_select" ON matches FOR SELECT USING (true);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Done! All tables, columns, and policies should now be in place.
