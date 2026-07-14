-- Phase 3E-4: adds the `full` variant (native-resolution webp, quality 85).
-- Nullable: the existing 83 seeded rows have no `full` variant until the
-- backfill (scripts/backfill-full.ts) runs and applies scripts/backfill-full.sql.
-- SQLite requires one column per ALTER TABLE statement.
ALTER TABLE photos ADD COLUMN full_key TEXT;
ALTER TABLE photos ADD COLUMN full_w INTEGER;
ALTER TABLE photos ADD COLUMN full_h INTEGER;
