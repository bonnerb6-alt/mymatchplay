-- Add member type to club_memberships
ALTER TABLE club_memberships ADD COLUMN member_type TEXT NOT NULL DEFAULT 'mens' CHECK (member_type IN ('mens', 'ladies'));
