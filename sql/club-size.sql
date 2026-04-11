-- Add club size for pricing tiers
ALTER TABLE clubs ADD COLUMN club_size INTEGER;
-- Pricing: <300 = £100/yr, 301-500 = £200/yr, 501-1000 = £300/yr
