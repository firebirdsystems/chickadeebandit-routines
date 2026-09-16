/**
 * Two defects in how a run is started and shown.
 *
 * 1. `runs` is `adult_writable`, so every member reads it, and a run copied its
 *    template's title, caregiver label and notes onto it. An adults-only
 *    template's words reached every child: Today, History, the agenda surface
 *    and the event bus. `runs` has to stay read-open (the kiosk checklist
 *    joins it as a parent, and the hub accepts only a read-open parent), so a
 *    restricted run keeps those words in run_details, under the template's
 *    visibility, and leaves them blank on the run row.
 *
 * 2. In a shared space the hub resolves run_steps' supervision from isAdmin,
 *    not from the adult role. A non-admin adult could start a run (runs only
 *    asks for an adult), and the hub rewrote every step's assignee to them.
 *    Starting a run, and ticking someone else's step, now follow supervision.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";
import { buildRun, runDisplay, mayPublishRun, showRunTo, isRunSupervisor, canCompleteStep, isRestrictedVisibility, MAX_BATCH_STATEMENTS, MAX_ROUTINE_STEPS } from "../src/logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(__dirname, "..", p), "utf-8");
const client = read("src/index.html");
const manifest = JSON.parse(read("manifest.json"));
const migration = read("migrations/005_restricted_run_details.sql");

const template = (visibility) => ({ id: "t-1", title: "Gift wrapping", visibility });
const steps = [
  { title: "Wrap", details: "In the garage", icon: "🎁", sort_order: 0, required: 1, assigned_member_id: "kid-1", role_label: "" },
  { title: "Hide", details: "", sort_order: 1, required: 1, assigned_member_id: null, role_label: "" }
];
let n = 0;
const start = (visibility, extra = {}) => buildRun({
  template: template(visibility), steps, runId: "r-1", memberId: "a1", runDate: "2026-09-16",
  targetMemberId: "", caregiverLabel: "Grandma", notes: "Birthday on Sunday", now: "2026-09-16T09:00:00Z",
  stepId: () => `rs-${n++}`, ...extra
});
const cols = (sql) => sql.match(/\(([^)]*)\) VALUES/)[1].split(",");
const row = (statement, r = 0) => {
  const c = cols(statement.sql);
  return Object.fromEntries(c.map((name, i) => [name, statement.params[r * c.length + i]]));
};

describe("a run of a restricted template keeps its words off the read-open runs table", () => {
  it("treats every visibility but everyone as restricted", () => {
    expect(isRestrictedVisibility("everyone")).toBe(false);
    for (const v of ["adults", "members", undefined, ""]) expect(isRestrictedVisibility(v)).toBe(true);
  });

  it("an everyone run is written as before, with no details row", () => {
    const { run, details, statements } = start("everyone");
    expect(details).toBeNull();
    expect(statements.map((s) => s.sql.split(" (")[0])).toEqual(["INSERT INTO app_routines__runs", "INSERT INTO app_routines__run_steps"]);
    expect(row(statements[0])).toMatchObject({ title_snapshot: "Gift wrapping", caregiver_label: "Grandma", notes: "Birthday on Sunday", restricted: 0 });
    expect(mayPublishRun(run)).toBe(true);
  });

  it("an adults run blanks the words on the run row and writes them to run_details with the visibility", () => {
    const { run, details, statements } = start("adults");
    expect(statements.map((s) => s.sql.split(" (")[0])).toEqual([
      "INSERT INTO app_routines__runs", "INSERT INTO app_routines__run_details", "INSERT INTO app_routines__run_steps"
    ]);
    const runRow = row(statements[0]);
    expect(runRow).toMatchObject({ title_snapshot: "", caregiver_label: "", notes: "", restricted: 1 });
    expect(JSON.stringify(statements[0].params)).not.toMatch(/Gift|Grandma|Birthday/);
    expect(row(statements[1])).toEqual({
      id: "r-1", run_id: "r-1", started_by_member_id: "a1", visibility: "adults",
      title: "Gift wrapping", caregiver_label: "Grandma", notes: "Birthday on Sunday", created_at: "2026-09-16T09:00:00Z"
    });
    expect(details.visibility).toBe("adults");
    expect(mayPublishRun(run)).toBe(false);
  });

  it("snapshots every step, keeping each assignee and falling back to the run's target", () => {
    const { statements, runSteps } = start("adults", { targetMemberId: "kid-2" });
    const insert = statements[2];
    expect([row(insert, 0), row(insert, 1)].map((r) => [r.title_snapshot, r.assigned_member_id, r.template_step_id])).toEqual([
      ["Wrap", "kid-1", null], ["Hide", "kid-2", null]
    ]);
    expect(runSteps).toHaveLength(2);
  });

  it("fits the largest allowed run in one batch", () => {
    const many = Array.from({ length: MAX_ROUTINE_STEPS }, (_, i) => ({ title: `s${i}`, sort_order: i, required: 1 }));
    const { statements } = start("adults", { steps: many });
    expect(statements.length).toBeLessThanOrEqual(MAX_BATCH_STATEMENTS);
    for (const s of statements) expect(s.params.length).toBeLessThanOrEqual(90);
    expect(() => start("adults", { steps: [...many, { title: "one more", sort_order: 99, required: 1 }] })).toThrow(RangeError);
  });

  it("shows the details to a viewer who can read them, and nothing to one who cannot", () => {
    const base = { title_snapshot: "", caregiver_label: "", notes: "", restricted: 1 };
    expect(runDisplay({ ...base, detail_title: "Gift wrapping", detail_caregiver_label: "Grandma", detail_notes: "n" }))
      .toEqual({ title: "Gift wrapping", caregiverLabel: "Grandma", notes: "n", readable: true });
    expect(runDisplay({ ...base, detail_title: null, detail_caregiver_label: null, detail_notes: null }))
      .toEqual({ title: null, caregiverLabel: "", notes: "", readable: false });
    expect(runDisplay({ title_snapshot: "Bedtime", caregiver_label: "", notes: "", restricted: 0 }).title).toBe("Bedtime");
  });

  it("hides an unreadable run unless the viewer supervises or has one of its steps", () => {
    const hidden = { restricted: 1, detail_title: null };
    expect(showRunTo(hidden, [], false)).toBe(false);
    expect(showRunTo(hidden, [{ id: "rs-1" }], false)).toBe(true);
    expect(showRunTo(hidden, [], true)).toBe(true);
    expect(showRunTo({ restricted: 0, title_snapshot: "Bedtime" }, [], false)).toBe(true);
  });

  it("the client renders through runDisplay and gates every publish", () => {
    expect(client).not.toMatch(/esc\(run\.title_snapshot\)/);
    expect(client).not.toMatch(/run\.caregiver_label \?/);
    expect(client.match(/publish\("routine\.[a-z_]+"/g)).toHaveLength(3);
    expect(client.match(/mayPublishRun\(run\)\) publish\(/g)).toHaveLength(3);
  });
});

describe("manifest and migration 005", () => {
  const policies = manifest.row_policies;

  it("keeps runs read-open, as the kiosk checklist parent requires", () => {
    expect(policies.runs.kind).toBe("adult_writable");
    expect(policies.runs.member_read_column).toBeUndefined();
    expect(manifest.kiosk_checklist.parent.table).toBe("runs");
  });

  it("governs run_details by the copied visibility, mirroring templates", () => {
    expect(policies.run_details).toEqual({
      kind: "owner_or_visibility", member_column: "started_by_member_id", visibility_column: "visibility",
      everyone_values: policies.templates.everyone_values, adult_values: policies.templates.adult_values
    });
    expect(policies.runs.retain_days.dependent_tables).toContainEqual({ table: "run_details", foreign_key: "run_id" });
    expect(manifest.member_references.run_details).toEqual([{ column: "started_by_member_id", on_removed: "keep" }]);
  });

  it("the runs reads (preload, history, agenda, glance) all go through run_details", () => {
    const join = "LEFT JOIN app_routines__run_details d ON d.run_id = r.id";
    expect(manifest.preload.runs.sql).toContain(join);
    expect(client).toContain(`FROM app_routines__runs r ${join} WHERE r.status != 'active'`);
    for (const surface of [manifest.agenda.source.query, manifest.glance.source.query]) {
      expect(surface).toContain(join);
      expect(surface).toContain("(r.restricted = 0 OR d.id IS NOT NULL)");
    }
    expect(manifest.agenda.source.query).toContain("COALESCE(d.title, r.title_snapshot) AS title");
  });

  it("moves existing restricted runs' words by column copy, then blanks them", () => {
    expect(migration).toMatch(/ALTER TABLE app_routines__runs ADD COLUMN restricted INTEGER NOT NULL DEFAULT 0;/);
    expect(migration).toMatch(/SELECT r\.id, r\.household_id, r\.id, r\.started_by_member_id, t\.visibility, r\.title_snapshot, r\.caregiver_label, r\.notes, r\.started_at/);
    expect(migration).toMatch(/WHERE t\.visibility <> 'everyone';/);
    expect(migration).toMatch(/SET restricted = 1, title_snapshot = '', caregiver_label = '', notes = ''\s+WHERE id IN \(SELECT run_id FROM app_routines__run_details\);/);
  });
});

describe("starting a run follows run_steps' supervision, not the adult role", () => {
  it("is every adult in a household and only the admin in a space", () => {
    expect(isRunSupervisor({ tenantKind: "household", adult: true })).toBe(true);
    expect(isRunSupervisor({ tenantKind: "household", adult: false, isAdmin: true })).toBe(false);
    expect(isRunSupervisor({ tenantKind: "shared_space", adult: true, isAdmin: false })).toBe(false);
    expect(isRunSupervisor({ tenantKind: "shared_space", adult: true, isAdmin: true })).toBe(true);
    expect(isRunSupervisor()).toBe(false);
  });

  it("a non-supervisor may tick only a step assigned to them", () => {
    const adult = { id: "a2", role: "adult" };
    expect(canCompleteStep({ assigned_member_id: "a1" }, adult, false)).toBe(false);
    expect(canCompleteStep({ assigned_member_id: "a2" }, adult, false)).toBe(true);
    expect(canCompleteStep({ assigned_member_id: "a1" }, adult, true)).toBe(true);
  });

  it("the client gates both Start buttons, the start itself and the step buttons on supervision", () => {
    expect(client).toMatch(/isRunSupervisor\(\{ tenantKind: window\.__TENANT_KIND \?\? "household", isAdmin: window\.__IS_ADMIN === true, adult: userIsAdult\(\) \}\)/);
    expect(client).toMatch(/\$\{userSupervisesRuns\(\) \? `<button onclick="openRunModal\(\)" data-testid="start-routine">/);
    expect(client).toMatch(/\$\{userSupervisesRuns\(\) \? `<button onclick="openRunModal\('\$\{sid\(template\.id\)\}'\)" data-testid="template-start">/);
    expect(client).toMatch(/if \(!userSupervisesRuns\(\)\) return;/);
    expect(client.match(/canCompleteStep\(step, currentMember\(\), userSupervisesRuns\(\)\)/g)).toHaveLength(2);
  });
});
