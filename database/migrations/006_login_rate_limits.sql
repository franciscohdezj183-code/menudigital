-- Límite distribuido de intentos de login para Functions serverless.
-- Solo conserva identificadores HMAC; no almacena correos ni direcciones IP.
CREATE TABLE login_rate_limits (
  key_hash CHAR(64) PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  failed_attempts INTEGER NOT NULL CHECK (failed_attempts > 0),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX login_rate_limits_cleanup_idx ON login_rate_limits(updated_at);
