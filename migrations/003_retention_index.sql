-- runs/run_steps were the fastest-growing pair in the app: one run per routine
-- per day, times its steps, with nothing ever removing them. retain_days needs
-- (timestamp_column, id) to sweep without a full scan.
CREATE INDEX IF NOT EXISTS app_routines__runs_retention_idx
  ON app_routines__runs (started_at, id);
