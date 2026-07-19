-- Highlights: a synthetic gallery aggregating starred photos from all
-- categories. A photo keeps its real `category`; `is_highlight` marks it as
-- part of the highlights set and `highlight_order` orders that set
-- independently of the per-category `sort_order`.
ALTER TABLE photos ADD COLUMN is_highlight INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN highlight_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_photos_highlight ON photos(is_highlight, highlight_order);
