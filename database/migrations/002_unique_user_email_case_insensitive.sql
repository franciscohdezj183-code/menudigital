-- El login por email requiere unicidad global, no solo por negocio.
-- Falla de forma transaccional si existen duplicados; no borra ni modifica usuarios.
CREATE UNIQUE INDEX users_email_global_unique ON users (lower(email));
