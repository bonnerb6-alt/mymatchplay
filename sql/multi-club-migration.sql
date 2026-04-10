-- ============================================
-- Multi-Club Migration
-- A golfer can be a member of multiple clubs
-- with different roles and handicaps at each
-- ============================================

-- 1. Create the club_memberships junction table
CREATE TABLE club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'golfer' CHECK (role IN ('golfer', 'organiser')),
  handicap INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, club_id)
);

CREATE INDEX idx_memberships_member ON club_memberships(member_id);
CREATE INDEX idx_memberships_club ON club_memberships(club_id);

-- 2. RLS for club_memberships
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memberships_select" ON club_memberships FOR SELECT USING (true);
CREATE POLICY "memberships_insert" ON club_memberships FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY "memberships_update" ON club_memberships FOR UPDATE USING (
  EXISTS (SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.id = club_memberships.member_id)
  OR EXISTS (
    SELECT 1 FROM members m
    JOIN club_memberships cm ON cm.member_id = m.id
    WHERE m.auth_id = auth.uid() AND cm.club_id = club_memberships.club_id AND cm.role = 'organiser'
  )
);
CREATE POLICY "memberships_delete" ON club_memberships FOR DELETE USING (
  EXISTS (SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.id = club_memberships.member_id)
  OR EXISTS (
    SELECT 1 FROM members m
    JOIN club_memberships cm ON cm.member_id = m.id
    WHERE m.auth_id = auth.uid() AND cm.club_id = club_memberships.club_id AND cm.role = 'organiser'
  )
);

-- 3. Migrate existing member data into club_memberships
INSERT INTO club_memberships (member_id, club_id, role, handicap)
SELECT id, club_id, role, handicap FROM members WHERE club_id IS NOT NULL
ON CONFLICT (member_id, club_id) DO NOTHING;

-- 4. Done! The old members.club_id, members.role, members.handicap columns
--    are kept for backwards compatibility but club_memberships is now the
--    source of truth for club-specific data.
