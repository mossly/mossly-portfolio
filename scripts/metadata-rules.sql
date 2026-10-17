-- Replay of scripts/metadata-rules.json against D1 (same semantics as
-- POST /api/admin/photos/metadata/bulk). Order matters: the Takumar rule sets
-- aperture before the f/1-nulling rule runs.
UPDATE photos SET camera = 'Canon EOS 5D', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'Canon Canon EOS 5D';
UPDATE photos SET camera = 'Canon EOS 700D', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'Canon Canon EOS 700D';
UPDATE photos SET camera = 'Canon EOS R5', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'Canon Canon EOS R5';
UPDATE photos SET camera = 'Nikon Z8', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'NIKON CORPORATION NIKON Z 8';
UPDATE photos SET camera = 'Nikon Z8', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'NIKON Z 8';
UPDATE photos SET camera = 'Fujifilm X-T1', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'FUJIFILM X-T1';
UPDATE photos SET camera = 'Fujifilm X-T3', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'FUJIFILM X-T3';
UPDATE photos SET camera = 'Fujifilm X-T30', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'FUJIFILM X-T30';
UPDATE photos SET camera = 'Fujifilm X-T5', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE camera = 'FUJIFILM X-T5';
UPDATE photos SET lens = 'Canon EF 70-200mm f/2.8', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = '70.0 mm';
UPDATE photos SET lens = 'Canon EF 70-200mm f/2.8', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = '70 mm f/--';
UPDATE photos SET lens = 'Canon EF 70-200mm f/2.8', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = '200 mm f/--';
UPDATE photos SET lens = 'Canon EF 300mm f/2.8L IS USM', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = '300 mm f/--';
UPDATE photos SET lens = 'Laowa 4mm f/2.8 Fisheye', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = '4 mm f/--';
UPDATE photos SET lens = 'Asahi Pentax Super-Takumar 55mm f/1.8 (M42)', aperture = 'f/2.8', focal_length = '55mm', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = '1-65535mm';
UPDATE photos SET lens = 'Fujifilm XF 100-400mm f/4.5-5.6 R LM OIS WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'XF100-400mmF4.5-5.6 R LM OIS WR';
UPDATE photos SET lens = 'Fujifilm XF 100-400mm f/4.5-5.6 R LM OIS WR + 1.4x TC F2 WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'XF100-400mmF4.5-5.6 R LM OIS WR + 1.4x F2';
UPDATE photos SET lens = 'Fujifilm XF 16-55mm f/2.8 R LM WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Fujifilm Fujinon XF16-55mmF2.8 R LM WR';
UPDATE photos SET lens = 'Fujifilm XF 200mm f/2 R LM OIS WR + 1.4x TC F2 WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Fujifilm Fujinon XF200mmF2 R LM OIS WR + 1.4X TC F2 WR';
UPDATE photos SET lens = 'Fujifilm XF 90mm f/2 R LM WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Fujifilm Fujinon XF90mmF2 R LM WR';
UPDATE photos SET lens = 'Samyang 12mm f/2', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'SAMYANG 12MM F2';
UPDATE photos SET lens = 'TTArtisan 11mm f/2.8 Fisheye', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'TT ARTISAN 11MM f/2.8 FISHEYE';
UPDATE photos SET lens = 'Tamron 35-150mm f/2-2.8 Di III VXD', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'TAMRON 35-150mm F/2-2.8 Di III VXD A058Z';
UPDATE photos SET aperture = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE aperture = 'f/1';
UPDATE photos SET lens = 'Canon EF 70-200mm f/2.8 L USM', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Canon EF 70-200mm f/2.8';
UPDATE photos SET lens = 'Canon EF 70-200mm f/2.8 L USM', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'EF70-200mm f/2.8L USM';
UPDATE photos SET lens = 'Canon EF 300mm f/2.8 L IS USM', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Canon EF 300mm f/2.8L IS';
UPDATE photos SET lens = 'Canon EF 300mm f/2.8 L IS USM', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Canon EF 300mm f/2.8L IS USM';
UPDATE photos SET lens = 'Sigma XF 30mm f/1.4 DC DN C', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Sigma 30mm F1.4 DC DN | C (Fujifilm X)';
UPDATE photos SET lens = 'Nikkor Z 180-600mm f/5.6-6.3 VR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'NIKKOR Z 180-600mm f/5.6-6.3 VR';
UPDATE photos SET lens = 'Nikkor Z 24-120mm f/4 S', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'NIKKOR Z 24-120mm f/4 S';
UPDATE photos SET lens = 'Fujinon XF 100-400mm f/4.5-5.6 R LM OIS WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Fujifilm XF 100-400mm f/4.5-5.6 R LM OIS WR';
UPDATE photos SET lens = 'Fujinon XF 100-400mm f/4.5-5.6 R LM OIS WR + 1.4x TC F2 WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Fujifilm XF 100-400mm f/4.5-5.6 R LM OIS WR + 1.4x TC F2 WR';
UPDATE photos SET lens = 'Fujinon XF 16-55mm f/2.8 R LM WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Fujifilm XF 16-55mm f/2.8 R LM WR';
UPDATE photos SET lens = 'Fujinon XF 200mm f/2 R LM OIS WR + 1.4x TC F2 WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Fujifilm XF 200mm f/2 R LM OIS WR + 1.4x TC F2 WR';
UPDATE photos SET lens = 'Fujinon XF 90mm f/2 R LM WR', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lens = 'Fujifilm XF 90mm f/2 R LM WR';
