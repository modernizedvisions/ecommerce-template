-- Migration-driven image links for legacy tables.
-- Existing environments may already include some columns from prior runtime schema shims.
-- This migration adds the remaining canonical link columns that were not part of baseline migrations.

ALTER TABLE custom_order_examples ADD COLUMN image_id TEXT;
ALTER TABLE messages ADD COLUMN image_id TEXT;
