-- No-op: these columns are part of the canonical schema in db/migrations/live_init.sql.
-- Keeping this migration executable prevents duplicate-column failures on existing DBs.
SELECT 1;
