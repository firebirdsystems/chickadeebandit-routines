CREATE TABLE IF NOT EXISTS app_routines__templates (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'household',
  visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone','adults','members')),
  owner_member_id TEXT NOT NULL,
  target_member_id TEXT,
  default_start_time TEXT,
  default_duration_minutes INTEGER,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app_routines__template_steps (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL DEFAULT '',
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  suggested_offset_minutes INTEGER,
  assigned_member_id TEXT,
  role_label TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (template_id) REFERENCES app_routines__templates(id)
);

CREATE TABLE IF NOT EXISTS app_routines__template_audience (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL DEFAULT '',
  template_id TEXT NOT NULL,
  member_id TEXT,
  group_id TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (template_id) REFERENCES app_routines__templates(id)
);

CREATE TABLE IF NOT EXISTS app_routines__runs (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL DEFAULT '',
  template_id TEXT,
  title_snapshot TEXT NOT NULL,
  run_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','canceled')),
  started_by_member_id TEXT NOT NULL,
  target_member_id TEXT,
  caregiver_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  canceled_at TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (template_id) REFERENCES app_routines__templates(id)
);

CREATE TABLE IF NOT EXISTS app_routines__run_steps (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL DEFAULT '',
  run_id TEXT NOT NULL,
  template_step_id TEXT,
  title_snapshot TEXT NOT NULL,
  details_snapshot TEXT NOT NULL DEFAULT '',
  assigned_member_id TEXT,
  role_label TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  completed_by_member_id TEXT,
  completed_at TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (run_id) REFERENCES app_routines__runs(id),
  FOREIGN KEY (template_step_id) REFERENCES app_routines__template_steps(id)
);

CREATE TABLE IF NOT EXISTS app_routines__caregiver_packets (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL DEFAULT '',
  template_id TEXT,
  run_id TEXT,
  title TEXT NOT NULL,
  safe_notes TEXT NOT NULL DEFAULT '',
  include_contacts INTEGER NOT NULL DEFAULT 0 CHECK (include_contacts IN (0,1)),
  include_health_notes INTEGER NOT NULL DEFAULT 0 CHECK (include_health_notes IN (0,1)),
  include_documents INTEGER NOT NULL DEFAULT 0 CHECK (include_documents IN (0,1)),
  created_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (template_id) REFERENCES app_routines__templates(id),
  FOREIGN KEY (run_id) REFERENCES app_routines__runs(id)
);

CREATE TABLE IF NOT EXISTS app_routines__caregiver_packet_steps (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL DEFAULT '',
  packet_id TEXT NOT NULL,
  source_step_id TEXT,
  title_snapshot TEXT NOT NULL,
  details_snapshot TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  FOREIGN KEY (packet_id) REFERENCES app_routines__caregiver_packets(id)
);

CREATE INDEX IF NOT EXISTS app_routines__idx_templates_archived
  ON app_routines__templates(archived_at, visibility, category);
CREATE INDEX IF NOT EXISTS app_routines__idx_template_steps_template
  ON app_routines__template_steps(template_id, sort_order);
CREATE INDEX IF NOT EXISTS app_routines__idx_runs_status_date
  ON app_routines__runs(status, run_date, started_at);
CREATE INDEX IF NOT EXISTS app_routines__idx_run_steps_run
  ON app_routines__run_steps(run_id, sort_order);
CREATE INDEX IF NOT EXISTS app_routines__idx_packets_created
  ON app_routines__caregiver_packets(created_at);
