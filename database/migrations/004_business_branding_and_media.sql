ALTER TABLE businesses
  ADD COLUMN logo_public_id TEXT,
  ADD COLUMN cover_public_id TEXT,
  ADD COLUMN theme_color VARCHAR(7)
    CHECK (theme_color IS NULL OR theme_color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE categories ADD COLUMN image_public_id TEXT;
ALTER TABLE products ADD COLUMN image_public_id TEXT;
ALTER TABLE promotions ADD COLUMN image_public_id TEXT;
