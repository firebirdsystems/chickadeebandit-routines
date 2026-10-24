/**
 * Two defects in how a run is started and shown.
 *
 * 1. `runs` is read-open (every member reads it), and a run copied its
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
import { buildRun, runDisplay, mayPublishRun, showRunTo, isRunSupervisor, isGuest, canStartRun, runAccess, mayCloseRun, canCompleteStep, isRestrictedVisibility, MAX_BATCH_STATEMENTS, MAX_ROUTINE_STEPS } from "../src/logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(__dirname, "..", p), "utf-8");
const client = read("src/index.html");
const manifest = JSON.parse(read("manifest.json"));
const migration = read("migrations/005_restricted_run_details.sql");
const migration007 = read("migrations/007_run_visibility.sql");

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

  it("keeps runs read-open, as the kiosk checklist parent requires, while a guest may start one", () => {
    // owner_or_visibility with the visibility column locked at its migration
    // DEFAULT 'everyone' is the one narrower shape the hub accepts as a
    // checklist parent: every row is public, so dropping the policy from the
    // kiosk toggle changes nothing.
    const { column_write_acls: acls, ...shape } = policies.runs;
    expect(shape).toEqual({
      kind: "owner_or_visibility", member_column: "started_by_member_id", visibility_column: "visibility",
      everyone_values: ["everyone"], delete_adult_only: true, write_visibility_scoped: true
    });
    expect(acls.started_by_member_id).toEqual({ writable_by: [], actions: ["update"] });
    expect(acls.visibility).toEqual({ writable_by: [] });
    expect(acls.step_count).toEqual({ writable_by: [], actions: ["update"] });
    expect(policies.runs.member_read_column).toBeUndefined();
    expect(policies.runs.column_read_acls).toBeUndefined();
    expect(manifest.kiosk_checklist.parent.table).toBe("runs");
    expect(migration007).toMatch(/ALTER TABLE app_routines__runs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'everyone';/);
    expect(manifest.db_plaintext_columns).toContain("visibility");
    // The page never writes the locked column: the DEFAULT is the only value.
    const { statements } = start("everyone");
    expect(cols(statements[0].sql)).not.toContain("visibility");
  });

  it("governs run_details by the copied visibility, mirroring templates", () => {
    expect(policies.run_details).toEqual({
      kind: "owner_or_visibility", member_column: "started_by_member_id", visibility_column: "visibility",
      everyone_values: policies.templates.everyone_values, adult_values: policies.templates.adult_values
    });
    expect(manifest.retention.runs.dependent_tables).toContainEqual({ table: "run_details", foreign_key: "run_id" });
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

  it("the client gates the step buttons on supervision, and both Start buttons and the start itself on supervision-or-guest", () => {
    // One tenant object feeds every gate.
    expect(client).toMatch(/const userSupervisesRuns = \(\) => !ME \|\| isRunSupervisor\(tenant\(\)\);/);
    expect(client.match(/tenantKind: window\.__TENANT_KIND/g)).toHaveLength(1);
    expect(client).toMatch(/const userMayStartRuns = \(\) => !ME \|\| canStartRun\(currentMember\(\), tenant\(\)\);/);
    // One path for a guest with nothing shared: Start shows, and the modal says so.
    expect(client).toMatch(/\$\{userMayStartRuns\(\) \? `<button onclick="openRunModal\(\)" data-testid="start-routine">/);
    expect(client).toContain(`hubAlert("No routines are shared with you yet.", { description: "Someone who manages routines can share one with you." })`);
    // Starter templates are the adults' to add; nobody else is told to.
    expect(client).toMatch(/: userIsAdult\(\)\s*\? `<div class="empty">No templates yet\. Add starter templates or create your own\.<\/div>`\s*: `<div class="empty" data-testid="no-shared-templates">No routines are shared with you yet\.<\/div>`/);
    expect(client).toMatch(/userMayStartRuns\(\) \? `<button onclick="openRunModal\('\$\{sid\(template\.id\)\}'\)" data-testid="template-start">/);
    expect(client).toMatch(/if \(!userMayStartRuns\(\)\) return;/);
    expect(client).toMatch(/starterOwnsSteps: !userSupervisesRuns\(\)/);
    expect(client.match(/canCompleteStep\(step, currentMember\(\), userSupervisesRuns\(\)\)/g)).toHaveLength(2);
  });
});

describe("a guest (a nanny or sitter) starts a run and owns its steps", () => {
  const household = { tenantKind: "household", adult: false };
  const nanny = { id: "g1", role: "guest" };
  const kid = { id: "k1", role: "child" };

  it("is offered Start; a child is not; a supervisor is", () => {
    expect(isGuest(nanny)).toBe(true);
    expect(isGuest(kid)).toBe(false);
    expect(isGuest(null)).toBe(false);
    expect(canStartRun(nanny, household)).toBe(true);
    expect(canStartRun(kid, household)).toBe(false);
    expect(canStartRun({ id: "a1", role: "adult" }, { tenantKind: "household", adult: true })).toBe(true);
    expect(canStartRun({ id: "a1", role: "adult" }, { tenantKind: "shared_space", adult: true, isAdmin: false })).toBe(false);
  });

  it("buildRun assigns every step to the starter when asked, as the hub will anyway", () => {
    const { runSteps, run } = start("everyone", { memberId: "g1", targetMemberId: "k1", starterOwnsSteps: true });
    expect(run.started_by_member_id).toBe("g1");
    expect(run.target_member_id).toBe("k1");
    expect(runSteps.map((s) => s.assigned_member_id)).toEqual(["g1", "g1"]);
    // A supervisor's run keeps the template's assignees, the run's member for the rest.
    const theirs = start("everyone", { targetMemberId: "k1" }).runSteps.map((s) => s.assigned_member_id);
    expect(theirs).toEqual(["kid-1", "k1"]);
  });

  it("the starter ticks every step of their run, finishes and cancels it; a child who did not start it does neither", () => {
    const { runSteps, run } = start("everyone", { memberId: "g1", starterOwnsSteps: true });
    for (const step of runSteps) expect(canCompleteStep(step, nanny, false)).toBe(true);
    expect(runAccess(run, nanny, household, runSteps)).toEqual({ seesWhole: true, mayClose: true, mayFinish: true });
    expect(runAccess(run, kid, household, [])).toEqual({ seesWhole: false, mayClose: false, mayFinish: false });
    // Any adult may close any run, a non-steward adult in a space included
    // (the runs policy lets an adult write every column of any run it reads).
    const adult = { id: "a9", role: "adult" };
    expect(runAccess(run, adult, { tenantKind: "household", adult: true }, runSteps)).toEqual({ seesWhole: true, mayClose: true, mayFinish: true });
    const participant = { tenantKind: "shared_space", spaceKind: "coparenting", adult: true, isAdmin: false };
    expect(runAccess(run, adult, participant, [])).toEqual({ seesWhole: false, mayClose: true, mayFinish: false });
    expect(runAccess(run, adult, participant, runSteps)).toEqual({ seesWhole: true, mayClose: true, mayFinish: true });
  });

  it("in a roster space only the steward and the starter close a run (the hub narrows a non-steward's writes to their own rows)", () => {
    const { runSteps, run } = start("everyone", { memberId: "g1", starterOwnsSteps: true });
    const rosterAdult = { tenantKind: "shared_space", spaceKind: "roster", adult: true, isAdmin: false };
    const rosterSteward = { tenantKind: "shared_space", spaceKind: "roster", adult: true, isAdmin: true };
    expect(runAccess(run, { id: "a9", role: "adult" }, rosterAdult, runSteps)).toEqual({ seesWhole: true, mayClose: false, mayFinish: false });
    expect(runAccess(run, { id: "s1", role: "adult" }, rosterSteward, []).mayClose).toBe(true);
    expect(runAccess(run, { id: "g1", role: "adult" }, rosterAdult, runSteps)).toEqual({ seesWhole: true, mayClose: true, mayFinish: true });
    // A general space keeps the adult reach.
    expect(runAccess(run, { id: "a9", role: "adult" }, { ...rosterAdult, spaceKind: "general" }, runSteps).mayClose).toBe(true);
  });

  it("a run with no recorded step count is never whole to a non-supervisor other than its starter, who sees none of its steps", () => {
    const { run } = start("everyone", { memberId: "g1", starterOwnsSteps: true });
    const other = { id: "g2", role: "guest" };
    expect(runAccess({ ...run, step_count: 0 }, other, household, [])).toEqual({ seesWhole: false, mayClose: false, mayFinish: false });
    expect(runAccess({ ...run, step_count: "0" }, other, household, []).seesWhole).toBe(false);
    expect(runAccess({ ...run, step_count: null }, other, household, []).seesWhole).toBe(false);
    expect(runAccess({ ...run, step_count: 0 }, kid, household, []).seesWhole).toBe(false);
    // The starter of a count-less run still is not whole once she reads a step:
    // 0 recorded steps does not match the one she sees.
    expect(runAccess({ ...run, step_count: 0 }, nanny, household, [{ id: "s1" }]).seesWhole).toBe(false);
    // A supervisor is still whole on a count-less run.
    expect(runAccess({ ...run, step_count: 0 }, { id: "p1", role: "adult" }, { tenantKind: "household", adult: true }, []).seesWhole).toBe(true);
  });

  it("a guest who starts a template with no steps can finish her own run", () => {
    const { run, runSteps } = start("everyone", { memberId: "g1", starterOwnsSteps: true, steps: [] });
    expect(runSteps).toEqual([]);
    expect(run.step_count).toBe(0);
    expect(runAccess(run, nanny, household, [])).toEqual({ seesWhole: true, mayClose: true, mayFinish: true });
    // Nobody else who does not supervise judges it whole.
    expect(runAccess(run, { id: "g2", role: "guest" }, household, []).seesWhole).toBe(false);
    expect(runAccess(run, kid, household, []).seesWhole).toBe(false);
  });

  it("mayCloseRun is runAccess's mayClose without the steps, and the Finish handler's first gate", () => {
    const { run } = start("everyone", { memberId: "g1", starterOwnsSteps: true });
    const tenants = [household, { tenantKind: "household", adult: true },
      { tenantKind: "shared_space", spaceKind: "roster", adult: true, isAdmin: false },
      { tenantKind: "shared_space", spaceKind: "roster", adult: true, isAdmin: true }];
    for (const tenant of tenants) {
      for (const member of [nanny, kid, { id: "a9", role: "adult" }, null]) {
        expect(mayCloseRun(run, member, tenant)).toBe(runAccess(run, member, tenant, []).mayClose);
      }
    }
    expect(client).toMatch(/if \(!judged \|\| !userMayCloseRun\(judged\)\) return;/);
  });

  it("records the step count at the start, and a non-supervisor finishes only when every step is one they read", () => {
    const { run, runSteps, statements } = start("everyone", { memberId: "g1", starterOwnsSteps: true });
    expect(run.step_count).toBe(2);
    expect(row(statements[0]).step_count).toBe(2);
    expect(runAccess(run, nanny, household, runSteps).seesWhole).toBe(true);
    expect(runAccess(run, nanny, household, runSteps.slice(1))).toEqual({ seesWhole: false, mayClose: true, mayFinish: false });
    expect(runAccess({ ...run, step_count: undefined }, nanny, household, runSteps).seesWhole).toBe(false);
    // A supervisor reads every step, so the count does not decide for them.
    expect(runAccess(run, { id: "p1", role: "adult" }, { tenantKind: "household", adult: true }, []).seesWhole).toBe(true);
    // The card (label, buttons) and the Finish handler ask the one function.
    expect(client).toContain("const access = userRunAccess(run, steps);");
    expect(client).toContain("${access.seesWhole");
    expect(client).toContain(`run.status === "active" && access.mayClose ?`);
    // Finish is drawn only to whoever may finish; Cancel to whoever may close.
    expect(client).toMatch(/\$\{access\.mayFinish \? `<button onclick="completeRunIfReady\(/);
    expect(client).toMatch(/if \(!userRunAccess\(judged, judgedSteps\)\.mayFinish\)/);
    expect(client).toContain(`hubAlert("Some steps belong to someone else.", { description: "Someone who manages routines can finish this one." })`);
    expect(client).not.toMatch(/a parent can/i);
    expect(migration007).toMatch(/ADD COLUMN step_count INTEGER NOT NULL DEFAULT 0;/);
  });
});

describe("closing a run the hub narrowed away", () => {
  it("a guarded write that changed nothing on a still-active run is a permission answer, not a retry", () => {
    const body = client.slice(client.indexOf("async function setRunStatus"), client.indexOf("async function freshStaleClosures"));
    expect(body).toContain("hubAlert(`You don’t have permission to ${status === \"completed\" ? \"finish\" : \"cancel\"} this routine.`)");
    expect(body).not.toContain("Try again");
  });
});

describe("template management stays with adults on the page", () => {
  it("a non-adult who owns a template is offered neither Edit nor Archive, and neither handler acts for her", () => {
    // canEditTemplate/canArchiveTemplate pass an owner of any role; the page
    // narrows them to adults (a child-owned row inserted by hand, or an adult
    // since made a child, manages nothing).
    expect(client).toContain("const userCanEditTemplate = (template) => !ME || (userIsAdult() && canEditTemplate(template, currentMember(), tenant()));");
    expect(client).toContain("const userCanArchiveTemplate = (template) => !ME || (userIsAdult() && canArchiveTemplate(template, currentMember(), tenant()));");
    // The buttons and the handlers ask those two gates and nothing looser.
    expect(client).toMatch(/userCanEditTemplate\(template\) \? `<button onclick="openTemplateModal\(/);
    expect(client).toMatch(/userCanArchiveTemplate\(template\) \? `<button class="danger" onclick="archiveTemplate\(/);
    expect(client).toContain("if (existing && !userCanEditTemplate(existing)) return;");
    expect(client).toContain("if (!template || !userCanArchiveTemplate(template)) return;");
    expect(client).not.toMatch(/[^(&] canEditTemplate\(template, currentMember\(\)/);
  });
});
