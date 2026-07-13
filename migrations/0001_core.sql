CREATE TABLE photos (
  id             TEXT PRIMARY KEY,               -- legacy md5 (83) | sha256(bytes)[:16] (new)
  content_hash   TEXT UNIQUE,                    -- full sha256 hex; dedupe key; NEVER shipped to public API
  category       TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  description    TEXT,
  filename       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  deleted_at     TEXT,                           -- soft-delete tombstone (NULL = live); R2 has no versioning
  sort_order     INTEGER NOT NULL DEFAULT 0,

  medium_key     TEXT NOT NULL,
  medium_w       INTEGER NOT NULL,
  medium_h       INTEGER NOT NULL,
  large_key      TEXT,
  large_w        INTEGER,
  large_h        INTEGER,
  aspect_ratio   REAL NOT NULL,

  date_taken     TEXT,
  camera         TEXT,
  lens           TEXT,
  iso            INTEGER,
  aperture       TEXT,
  shutter_speed  TEXT,
  focal_length   TEXT,
  location       TEXT,
  orientation    INTEGER,
  exif_json      TEXT,

  original_key   TEXT,
  original_bytes INTEGER,
  original_w     INTEGER NOT NULL,               -- lightbox/PhotoSwipe needs original dims
  original_h     INTEGER NOT NULL,

  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_photos_cat_order ON photos(category, sort_order);
CREATE INDEX idx_photos_status    ON photos(status);
CREATE INDEX idx_photos_live      ON photos(deleted_at);
