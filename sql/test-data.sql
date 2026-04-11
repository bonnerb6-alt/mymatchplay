-- ============================================
-- Test Data: 2 Clubs + 24 Golfers
-- ============================================

-- Club 1 already exists (Greenview Golf Club)
-- Create Club 2 and Club 3
INSERT INTO clubs (id, name, contact_name, contact_email, payment_status) VALUES
  ('b2b2b2b2-0000-0000-0000-000000000001', 'Lakeside Golf Club', 'John Daly', 'john@lakesidegc.ie', 'active'),
  ('c3c3c3c3-0000-0000-0000-000000000001', 'Hillcrest Golf Society', 'Pat Byrne', 'pat@hillcrestgs.ie', 'trial');

-- 12 golfers for Lakeside Golf Club
INSERT INTO members (id, club_id, first_name, last_name, handicap, phone, email, role, contact_preference) VALUES
  ('20000000-0000-0000-0000-000000000001', 'b2b2b2b2-0000-0000-0000-000000000001', 'Conor', 'McCarthy', 7, '087 111 0001', 'conor.mccarthy@test.com', 'golfer', 'whatsapp'),
  ('20000000-0000-0000-0000-000000000002', 'b2b2b2b2-0000-0000-0000-000000000001', 'Shane', 'O''Sullivan', 11, '087 111 0002', 'shane.osullivan@test.com', 'golfer', 'sms'),
  ('20000000-0000-0000-0000-000000000003', 'b2b2b2b2-0000-0000-0000-000000000001', 'Declan', 'Fitzpatrick', 14, '087 111 0003', 'declan.fitz@test.com', 'golfer', 'whatsapp'),
  ('20000000-0000-0000-0000-000000000004', 'b2b2b2b2-0000-0000-0000-000000000001', 'Barry', 'Gallagher', 9, '087 111 0004', 'barry.g@test.com', 'golfer', 'email'),
  ('20000000-0000-0000-0000-000000000005', 'b2b2b2b2-0000-0000-0000-000000000001', 'Ciaran', 'Maguire', 16, '087 111 0005', 'ciaran.m@test.com', 'golfer', 'whatsapp'),
  ('20000000-0000-0000-0000-000000000006', 'b2b2b2b2-0000-0000-0000-000000000001', 'Donal', 'Whelan', 5, '087 111 0006', 'donal.w@test.com', 'golfer', 'whatsapp'),
  ('20000000-0000-0000-0000-000000000007', 'b2b2b2b2-0000-0000-0000-000000000001', 'Eamon', 'Quinn', 13, '087 111 0007', 'eamon.q@test.com', 'golfer', 'sms'),
  ('20000000-0000-0000-0000-000000000008', 'b2b2b2b2-0000-0000-0000-000000000001', 'Finbar', 'Regan', 18, '087 111 0008', 'finbar.r@test.com', 'golfer', 'whatsapp'),
  ('20000000-0000-0000-0000-000000000009', 'b2b2b2b2-0000-0000-0000-000000000001', 'Gary', 'Tierney', 10, '087 111 0009', 'gary.t@test.com', 'golfer', 'whatsapp'),
  ('20000000-0000-0000-0000-000000000010', 'b2b2b2b2-0000-0000-0000-000000000001', 'Hugh', 'Costello', 22, '087 111 0010', 'hugh.c@test.com', 'golfer', 'email'),
  ('20000000-0000-0000-0000-000000000011', 'b2b2b2b2-0000-0000-0000-000000000001', 'Ian', 'Sheridan', 8, '087 111 0011', 'ian.s@test.com', 'golfer', 'whatsapp'),
  ('20000000-0000-0000-0000-000000000012', 'b2b2b2b2-0000-0000-0000-000000000001', 'Joe', 'Kavanagh', 15, '087 111 0012', 'joe.k@test.com', 'golfer', 'sms');

-- 12 golfers for Hillcrest Golf Society
INSERT INTO members (id, club_id, first_name, last_name, handicap, phone, email, role, contact_preference) VALUES
  ('30000000-0000-0000-0000-000000000001', 'c3c3c3c3-0000-0000-0000-000000000001', 'Kevin', 'Moriarty', 12, '086 222 0001', 'kevin.m@test.com', 'golfer', 'whatsapp'),
  ('30000000-0000-0000-0000-000000000002', 'c3c3c3c3-0000-0000-0000-000000000001', 'Liam', 'Corcoran', 6, '086 222 0002', 'liam.c@test.com', 'golfer', 'whatsapp'),
  ('30000000-0000-0000-0000-000000000003', 'c3c3c3c3-0000-0000-0000-000000000001', 'Martin', 'Duggan', 19, '086 222 0003', 'martin.d@test.com', 'golfer', 'sms'),
  ('30000000-0000-0000-0000-000000000004', 'c3c3c3c3-0000-0000-0000-000000000001', 'Noel', 'Egan', 8, '086 222 0004', 'noel.e@test.com', 'golfer', 'whatsapp'),
  ('30000000-0000-0000-0000-000000000005', 'c3c3c3c3-0000-0000-0000-000000000001', 'Ollie', 'Flanagan', 21, '086 222 0005', 'ollie.f@test.com', 'golfer', 'email'),
  ('30000000-0000-0000-0000-000000000006', 'c3c3c3c3-0000-0000-0000-000000000001', 'Paddy', 'Gorman', 14, '086 222 0006', 'paddy.g@test.com', 'golfer', 'whatsapp'),
  ('30000000-0000-0000-0000-000000000007', 'c3c3c3c3-0000-0000-0000-000000000001', 'Richie', 'Hogan', 10, '086 222 0007', 'richie.h@test.com', 'golfer', 'whatsapp'),
  ('30000000-0000-0000-0000-000000000008', 'c3c3c3c3-0000-0000-0000-000000000001', 'Sean', 'Ivory', 17, '086 222 0008', 'sean.i@test.com', 'golfer', 'sms'),
  ('30000000-0000-0000-0000-000000000009', 'c3c3c3c3-0000-0000-0000-000000000001', 'Tommy', 'Joyce', 3, '086 222 0009', 'tommy.j@test.com', 'golfer', 'whatsapp'),
  ('30000000-0000-0000-0000-000000000010', 'c3c3c3c3-0000-0000-0000-000000000001', 'Vincent', 'Keating', 25, '086 222 0010', 'vincent.k@test.com', 'golfer', 'whatsapp'),
  ('30000000-0000-0000-0000-000000000011', 'c3c3c3c3-0000-0000-0000-000000000001', 'Willie', 'Lawlor', 11, '086 222 0011', 'willie.l@test.com', 'golfer', 'email'),
  ('30000000-0000-0000-0000-000000000012', 'c3c3c3c3-0000-0000-0000-000000000001', 'Aidan', 'Moloney', 16, '086 222 0012', 'aidan.m@test.com', 'golfer', 'whatsapp');

-- Create club_memberships for all new members
INSERT INTO club_memberships (member_id, club_id, role, handicap)
SELECT id, club_id, role, handicap FROM members
WHERE club_id IN ('b2b2b2b2-0000-0000-0000-000000000001', 'c3c3c3c3-0000-0000-0000-000000000001')
ON CONFLICT (member_id, club_id) DO NOTHING;

-- Make Brian Bonner organiser of all 3 clubs
INSERT INTO club_memberships (member_id, club_id, role, handicap)
SELECT m.id, c.id, 'organiser', 12
FROM members m, clubs c
WHERE m.email = 'bonnerb@btinternet.com'
ON CONFLICT (member_id, club_id) DO UPDATE SET role = 'organiser';
