-- ============================================
-- MyMatchPlayPal - Supabase Database Schema
-- Run this in Supabase SQL Editor (supabase.com > SQL Editor)
-- ============================================

-- 1. TABLES
-- ============================================

CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  handicap INTEGER DEFAULT 0,
  phone TEXT,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'golfer' CHECK (role IN ('golfer', 'organiser')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(club_id, email)
);

CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  created_by UUID REFERENCES members(id),
  name TEXT NOT NULL,
  bracket_size INTEGER NOT NULL CHECK (bracket_size IN (8, 16, 32, 64)),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'entries_open', 'in_progress', 'completed')),
  entry_deadline DATE,
  round_days INTEGER DEFAULT 14,
  description TEXT,
  current_round INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  seed INTEGER,
  entered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, member_id)
);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  player1_id UUID REFERENCES members(id),
  player2_id UUID REFERENCES members(id),
  winner_id UUID REFERENCES members(id),
  score TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'bye')),
  deadline DATE,
  next_match_id UUID REFERENCES matches(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, round, position)
);

-- 2. INDEXES
-- ============================================

CREATE INDEX idx_members_club ON members(club_id);
CREATE INDEX idx_members_auth ON members(auth_id);
CREATE INDEX idx_tournaments_club ON tournaments(club_id);
CREATE INDEX idx_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX idx_entries_member ON tournament_entries(member_id);
CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_players ON matches(player1_id, player2_id);
CREATE INDEX idx_matches_winner ON matches(winner_id);

-- 3. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Clubs: anyone can read, organisers can manage
CREATE POLICY "clubs_select" ON clubs FOR SELECT USING (true);
CREATE POLICY "clubs_insert" ON clubs FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- Members: anyone can read (for brackets), own profile update, organisers manage
CREATE POLICY "members_select" ON members FOR SELECT USING (true);
CREATE POLICY "members_insert" ON members FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY "members_update" ON members FOR UPDATE USING (
  auth.uid() = auth_id
  OR EXISTS (
    SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.role = 'organiser' AND m.club_id = members.club_id
  )
);

-- Tournaments: anyone can read, organisers manage
CREATE POLICY "tournaments_select" ON tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_insert" ON tournaments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.role = 'organiser'
  )
);
CREATE POLICY "tournaments_update" ON tournaments FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.role = 'organiser' AND m.club_id = tournaments.club_id
  )
);

-- Tournament entries: anyone can read, members enter themselves, organisers manage
CREATE POLICY "entries_select" ON tournament_entries FOR SELECT USING (true);
CREATE POLICY "entries_insert" ON tournament_entries FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY "entries_delete" ON tournament_entries FOR DELETE USING (
  EXISTS (SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.id = tournament_entries.member_id)
  OR EXISTS (SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.role = 'organiser')
);

-- Matches: anyone can read (public brackets), participants/organisers update
CREATE POLICY "matches_select" ON matches FOR SELECT USING (true);
CREATE POLICY "matches_insert" ON matches FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.role = 'organiser'
  )
);
CREATE POLICY "matches_update" ON matches FOR UPDATE USING (
  EXISTS (SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND (m.id = matches.player1_id OR m.id = matches.player2_id))
  OR EXISTS (SELECT 1 FROM members m WHERE m.auth_id = auth.uid() AND m.role = 'organiser')
);

-- 4. ENABLE REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE matches;

-- 5. SEED DATA (Demo - Greenview Golf Club)
-- ============================================

INSERT INTO clubs (id, name) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Greenview Golf Club');

-- Note: These demo members have no auth_id (they're placeholders).
-- Real members will be created through sign-up.
INSERT INTO members (id, club_id, first_name, last_name, handicap, phone, email, role) VALUES
  ('00000001-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'James', 'Murphy', 12, '087 123 4567', 'james.murphy@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Mick', 'Ryan', 10, '087 678 9012', 'm.ryan@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Brian', 'Nolan', 9, '088 789 0123', 'b.nolan@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000004', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Sean', 'Walsh', 6, '085 345 6789', 'swalsh@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000005', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'David', 'Kelly', 8, '083 456 7890', 'd.kelly@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000006', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Eoin', 'Brennan', 11, '086 890 1234', 'e.brennan@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000007', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Ronan', 'Collins', 15, '089 901 2345', 'r.collins@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000008', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Patrick', 'O''Brien', 14, '086 234 5678', 'p.obrien@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000009', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Liam', 'Byrne', 16, '085 012 3456', 'l.byrne@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000010', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Fergal', 'Healy', 13, '087 345 6789', 'f.healy@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000011', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Kevin', 'Flynn', 17, '083 456 7891', 'k.flynn@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Colm', 'Dunne', 20, '089 567 8902', 'c.dunne@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000013', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Niall', 'Foley', 19, '086 678 9013', 'n.foley@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000014', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Alan', 'Keane', 22, '085 789 0124', 'a.keane@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000015', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Ger', 'Power', 21, '087 890 1235', 'g.power@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000016', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Tom', 'Doyle', 18, '089 567 8901', 'tdoyle@email.com', 'golfer'),
  ('00000001-0000-0000-0000-000000000099', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Mary', 'Connolly', 0, '087 999 0000', 'mary.connolly@email.com', 'organiser');
