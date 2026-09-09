-- Publicación y disponibilidad son conceptos independientes.
-- active=false oculta el producto; available=false lo mantiene visible como agotado.
ALTER TABLE products ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
