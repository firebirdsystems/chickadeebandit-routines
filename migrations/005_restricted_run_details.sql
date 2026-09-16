-- A run copied its template's title, caregiver label and notes onto
-- app_routines__runs. That table is `adult_writable`, which every member reads,
-- so starting an adults-only template published its words to every child: on
-- Today, History, the agenda surface and the event bus. runs cannot simply be
-- narrowed — the kiosk checklist joins it as the parent of run_steps, and the
-- hub accepts only a read-open table there.
--
-- So a restricted run keeps those words in run_details, which carries the
-- template's visibility under `owner_or_visibility`, and the run row keeps
-- `restricted = 1` with the three columns blank. One details row per run, keyed
-- by the run id.
ALTER TABLE app_routines__runs ADD COLUMN restricted INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS app_routines__run_details (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL DEFAULT '',
  run_id TEXT NOT NULL,
  started_by_member_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'adults' CHECK (visibility IN ('everyone','adults','members')),
  title TEXT NOT NULL,
  caregiver_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (run_id) REFERENCES app_routines__runs(id)
);

CREATE INDEX IF NOT EXISTS app_routines__idx_run_details_run
  ON app_routines__run_details(run_id);

-- Existing runs of a restricted template. The template's CURRENT visibility is
-- the only record of what it was when the run started. Column-to-column copies:
-- ciphertext is sealed to the household, not to a table, so it moves as is.
INSERT INTO app_routines__run_details (id, household_id, run_id, started_by_member_id, visibility, title, caregiver_label, notes, created_at)
  SELECT r.id, r.household_id, r.id, r.started_by_member_id, t.visibility, r.title_snapshot, r.caregiver_label, r.notes, r.started_at
  FROM app_routines__runs r
  JOIN app_routines__templates t ON t.id = r.template_id
  WHERE t.visibility <> 'everyone';

UPDATE app_routines__runs
  SET restricted = 1, title_snapshot = '', caregiver_label = '', notes = ''
  WHERE id IN (SELECT run_id FROM app_routines__run_details);
