-- A nanny or sitter signs in as a GUEST of the household, whom the hub treats
-- as a member who is not an adult. `runs` was `adult_writable`, so such a
-- person could not start bedtime, and a child could not either. This is what
-- lets the person who holds the evening start a routine and tick its steps.
--
-- `visibility` is the column the runs row policy reads (owner_or_visibility
-- in manifest.json). It is always 'everyone' and the manifest lets nobody
-- write it, so in a household every member still reads every run, as under
-- adult_writable. In a roster space the hub's star topology applies: a member
-- who is not the steward reads the steward's runs and their own. The words of
-- a run of an adults-only template stay in run_details (migration 005), which
-- carries its own visibility. The hub stamps `started_by_member_id` with the
-- caller on every insert and nobody can rewrite it afterwards; a run is any
-- adult's to change, or its starter's (in a roster space: the steward's or its
-- starter's). The kiosk checklist still joins this
-- table as the parent of run_steps, which the hub accepts exactly because the
-- column is locked and 'everyone' is public.
ALTER TABLE app_routines__runs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'everyone';

-- How many steps the run was started with, set once at the start and frozen
-- after. A starter who does not supervise reads only the run steps assigned to
-- them (run_steps is owner_only), so the page lets them finish only when the
-- steps they can read are all of them. Existing runs take their stored count.
ALTER TABLE app_routines__runs ADD COLUMN step_count INTEGER NOT NULL DEFAULT 0;
UPDATE app_routines__runs
  SET step_count = (SELECT COUNT(*) FROM app_routines__run_steps s WHERE s.run_id = app_routines__runs.id);
