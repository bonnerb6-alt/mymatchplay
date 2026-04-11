-- ============================================
-- Admin / Superuser & Payment Tracking
-- ============================================

-- 1. Add admin flag to members
ALTER TABLE members ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Add payment fields to clubs
ALTER TABLE clubs ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'trial' CHECK (payment_status IN ('trial', 'active', 'overdue', 'cancelled'));
ALTER TABLE clubs ADD COLUMN stripe_payment_link TEXT;
ALTER TABLE clubs ADD COLUMN subscription_expires DATE;
ALTER TABLE clubs ADD COLUMN contact_name TEXT;
ALTER TABLE clubs ADD COLUMN contact_email TEXT;
ALTER TABLE clubs ADD COLUMN contact_phone TEXT;
ALTER TABLE clubs ADD COLUMN notes TEXT;

-- 3. Make Brian Bonner the admin
UPDATE members SET is_admin = true WHERE email = 'bonnerb@btinternet.com';
