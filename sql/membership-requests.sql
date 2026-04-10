-- ============================================
-- Membership Requests & Pausable Memberships
-- ============================================

-- 1. Add status to club_memberships (active/paused)
ALTER TABLE club_memberships ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused'));

-- 2. Create membership_requests table
CREATE TABLE membership_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT,
  requested_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES members(id),
  UNIQUE(member_id, club_id, status)
);

CREATE INDEX idx_requests_club ON membership_requests(club_id);
CREATE INDEX idx_requests_member ON membership_requests(member_id);
CREATE INDEX idx_requests_status ON membership_requests(status);

-- 3. RLS
ALTER TABLE membership_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_select" ON membership_requests FOR SELECT USING (true);
CREATE POLICY "requests_insert" ON membership_requests FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY "requests_update" ON membership_requests FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM members m
    JOIN club_memberships cm ON cm.member_id = m.id
    WHERE m.auth_id = auth.uid() AND cm.club_id = membership_requests.club_id AND cm.role = 'organiser'
  )
);
