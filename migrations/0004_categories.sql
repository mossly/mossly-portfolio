-- User-managed gallery categories. The slug is stored in photos.category so
-- it remains stable if an administrator later changes the display name.
CREATE TABLE categories (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO categories (slug, name, sort_order) VALUES
  ('bird', 'BIRD', 0),
  ('landscape', 'LANDSCAPE', 1),
  ('portrait', 'PORTRAIT', 2),
  ('concert', 'CONCERT', 3),
  ('architecture', 'ARCHITECTURE', 4),
  ('nature', 'NATURE', 5),
  ('product', 'PRODUCT', 6),
  ('astro', 'ASTRO', 7),
  ('sports', 'SPORTS', 8),
  ('cat', 'CAT', 9),
  ('street', 'STREET', 10),
  ('wildlife', 'WILDLIFE', 11);
