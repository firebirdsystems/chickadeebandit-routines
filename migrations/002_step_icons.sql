-- Pre-reader support: an emoji per step, plus an optional per-step timer.
-- A child who can't read navigates the kiosk tile grid entirely by picture,
-- so the icon is the primary label there and the text is the fallback.
-- Runs snapshot the icon alongside the title for the same reason the title is
-- snapshotted: editing a template later must not rewrite finished history.
ALTER TABLE app_routines__template_steps ADD COLUMN icon TEXT NOT NULL DEFAULT '';
ALTER TABLE app_routines__template_steps ADD COLUMN timer_minutes INTEGER;

ALTER TABLE app_routines__run_steps ADD COLUMN icon_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE app_routines__run_steps ADD COLUMN timer_minutes INTEGER;

-- Note: completed_by_member_id moves to db_plaintext_columns in this version so
-- the kiosk can stamp it from inside a CASE expression. Rows written before
-- 1.2.0 hold an encrypted value there; the column is only ever displayed as
-- "who checked this off", so a stale ciphertext degrades to an unknown name
-- rather than corrupting anything.

-- The kiosk checklist reads run steps by run and sort order, then filters the
-- joined run by status/date; the existing run_steps index covers the first
-- half, this covers the join side.
CREATE INDEX IF NOT EXISTS app_routines__idx_runs_date_status
  ON app_routines__runs(run_date, status);
