/**
 * Saving a template rebuilds its steps: delete every step of the template, then
 * insert the edited list. Defects that lived in that sequence:
 *
 * 1. run_steps.template_step_id references template_steps(id) with no ON DELETE
 *    action, so the wholesale delete failed on any template that had been run.
 *    Releasing the links first only moved the failure: that UPDATE runs under
 *    run_steps' owner_only policy, so a saver who could not write another
 *    member's run step still hit the foreign key. Nothing ever READ the link, so
 *    it is retired — runs no longer write it and migration 004 clears it. The
 *    release stays, unguarded, for links an older open tab writes afterwards.
 * 2. The delete and the inserts were issued one statement at a time, so an
 *    interruption anywhere in the middle left the routine with no steps at all.
 *    They now go as one transactional batch.
 * 3. A save that could not reach the old steps appended a second copy instead.
 *    The UPDATE and DELETE now carry requireChanges.
 * 4. "One batch" was really one batch per 25 statements. A 24-step edit sent
 *    the DELETE and 22 inserts in the first and 2 inserts in the second; if the
 *    second failed, those steps were gone for good. Steps now go several rows
 *    per INSERT, the step count is capped where the worst case fits one batch,
 *    and the client refuses an over-long batch instead of splitting it.
 * 6. Two open editors both passed the UPDATE guard, which matched the id
 *    alone, so the later save replaced the earlier one's title and steps. The
 *    UPDATE now also matches the updated_at the editor loaded.
 * 5. A NEW template and its steps went as one batch, which the hub always
 *    refuses: it checks each step's template is visible by reading D1 before the
 *    batch runs, when the template does not exist yet. The template now goes
 *    first on its own, then the steps, with an undo if the steps fail.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";
import { templateSaveStatements, templateCreatePlan, buildRun, MAX_BATCH_STATEMENTS, MAX_ROUTINE_STEPS, ROWS_PER_INSERT } from "../src/logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = readFileSync(join(__dirname, "../src/index.html"), "utf-8");
const logic = readFileSync(join(__dirname, "../src/logic.js"), "utf-8");
const schema = readFileSync(join(__dirname, "../migrations/001_init.sql"), "utf-8");

describe("saveTemplate", () => {
  it("never writes a run step's template link", () => {
    const { runSteps, statements } = buildRun({
      template: { id: "t-1", title: "Bedtime", visibility: "everyone" },
      steps: [{ title: "Bath", details: "", sort_order: 0, required: 1 }],
      runId: "r-1", memberId: "a1", runDate: "2026-09-16", now: "n", stepId: () => "rs-1"
    });
    expect(runSteps[0].template_step_id).toBeNull();
    const insert = statements.find((st) => st.sql.startsWith("INSERT INTO app_routines__run_steps"));
    const cols = insert.sql.match(/\(([^)]*)\) VALUES/)[1].split(",");
    expect(insert.params[cols.indexOf("template_step_id")]).toBeNull();
  });

  it("clears the links already stored, in a migration that reaches every row", () => {
    const migration = readFileSync(join(__dirname, "../migrations/004_retire_template_step_link.sql"), "utf-8");
    expect(migration).toMatch(/UPDATE app_routines__run_steps SET template_step_id = NULL WHERE template_step_id IS NOT NULL;/);
    // Still nullable, or the migration itself would abort.
    expect(schema).toMatch(/template_step_id TEXT,/);
  });

  it("writes the rebuild as one batch, not one statement at a time", () => {
    expect(client).toMatch(/await dbBatch\(statements\)/);
    expect(client).not.toMatch(/await db\("INSERT INTO app_routines__template_steps/);
    expect(client).not.toMatch(/await db\("DELETE FROM app_routines__template_steps/);
  });

  it("refuses a batch past the /api/db cap instead of splitting it into separate transactions", () => {
    expect(MAX_BATCH_STATEMENTS).toBe(25);
    expect(client).not.toMatch(/dbBatchAll/);
    expect(client).toMatch(/if \(statements\.length > MAX_BATCH_STATEMENTS\) throw new RangeError/);
  });
});

describe("templateSaveStatements — a save that cannot reach the old steps is refused, not appended", () => {
  // inherit_visibility widens UPDATE/DELETE past the step's writer only for a
  // household or roster-space supervisor. Elsewhere another adult's DELETE
  // reached nothing while the INSERTs still landed, duplicating every step.
  const row = {
    id: "t-1", title: "Bedtime", description: "", category: "kids", visibility: "everyone",
    owner_member_id: "a1", target_member_id: null, default_start_time: null,
    default_duration_minutes: 45, archived_at: null, created_at: "c", updated_at: "u"
  };
  const step = (id, sort_order) => ({
    id, template_id: "t-1", title: id, details: "", icon: "", timer_minutes: null,
    suggested_offset_minutes: 0, assigned_member_id: null, role_label: "", required: 1,
    sort_order, created_at: "u", updated_at: "u"
  });
  const kinds = (statements) => statements.map((s) => s.sql.split(" ").slice(0, 2).join(" "));

  it("guards the template UPDATE and the step DELETE on an edit", () => {
    const out = templateSaveStatements({
      templateId: "t-1", row, loadedUpdatedAt: "loaded", doomedStepIds: ["s-1", "s-2"], stepRows: [step("s-3", 0)], memberId: "a2"
    });
    expect(kinds(out)).toEqual(["UPDATE app_routines__templates", "UPDATE app_routines__run_steps", "DELETE FROM", "INSERT INTO"]);
    // The release is best effort: it matches nothing once links are retired,
    // so a guard on it would refuse every ordinary save.
    expect(out.map((s) => s.requireChanges === true)).toEqual([true, false, true, false]);
    expect(out[1].params).toEqual(["s-1", "s-2"]);
    expect(out[2].params).toEqual(["t-1"]);
  });

  it("matches the updated_at the editor loaded, so a stale editor's save changes nothing and rolls back", () => {
    const out = templateSaveStatements({ templateId: "t-1", row, loadedUpdatedAt: "2026-09-16T08:00:00.000Z", stepRows: [step("s-3", 0)], memberId: "a2" });
    expect(out[0].sql).toMatch(/ SET .*updated_at=\? WHERE id=\? AND updated_at=\?$/);
    expect(out[0].params.slice(-3)).toEqual(["u", "t-1", "2026-09-16T08:00:00.000Z"]);
    expect(out[0].requireChanges).toBe(true);
    for (const missing of [undefined, null, ""]) {
      expect(() => templateSaveStatements({ templateId: "t-1", row, loadedUpdatedAt: missing, stepRows: [], memberId: "a2" })).toThrow(TypeError);
    }
    // The client passes the loaded row's value, not the new timestamp it writes.
    expect(client).toMatch(/const loadedUpdatedAt = templates\.find\(\(t\) => t\.id === id\)\?\.updated_at;\s*const statements = templateSaveStatements\(\{ templateId, row, loadedUpdatedAt,/);
    expect(client).toMatch(/templates = templates\.map\(\(t\) => t\.id === id \? \{ \.\.\.t, \.\.\.row \} : t\);/);
  });

  it("does not guard the DELETE when the template had no steps — zero is then correct", () => {
    const out = templateSaveStatements({ templateId: "t-1", row, loadedUpdatedAt: "loaded", doomedStepIds: [], stepRows: [step("s-3", 0)], memberId: "a2" });
    expect(kinds(out)).toEqual(["UPDATE app_routines__templates", "DELETE FROM", "INSERT INTO"]);
    expect(out[0].requireChanges).toBe(true);
    expect("requireChanges" in out[1]).toBe(false);
  });

  it("fits the largest allowed edit in ONE batch, under D1's 100-parameter statement limit", () => {
    // The reported case: 24 steps replacing 24. It used to take two batches.
    for (const n of [24, MAX_ROUTINE_STEPS]) {
      const out = templateSaveStatements({
        templateId: "t-1", row, loadedUpdatedAt: "loaded", doomedStepIds: Array.from({ length: n }, (_, i) => `old-${i}`),
        stepRows: Array.from({ length: n }, (_, i) => step(`new-${i}`, i)), memberId: "a2"
      });
      expect(out.length, `${n} steps`).toBeLessThanOrEqual(MAX_BATCH_STATEMENTS);
      for (const st of out) expect(st.params.length, st.sql.slice(0, 40)).toBeLessThanOrEqual(90);
      const inserted = out.filter((st) => st.sql.startsWith("INSERT INTO app_routines__template_steps"))
        .flatMap((st) => st.params.filter((_, i) => i % 14 === 0));
      expect(inserted).toEqual(Array.from({ length: n }, (_, i) => `new-${i}`));
      const guarded = out.map((st, i) => (st.requireChanges ? i : -1)).filter((i) => i >= 0);
      expect(guarded).toEqual([0, 2]);
    }
  });

  it("puts several steps in each INSERT, with one tuple per row and every parameter bound", () => {
    const { steps } = templateCreatePlan({ row, stepRows: Array.from({ length: 13 }, (_, i) => step(`s-${i}`, i)), memberId: "a2" });
    expect(steps.map((st) => st.params.length / 14)).toEqual([ROWS_PER_INSERT, ROWS_PER_INSERT, 1]);
    for (const st of steps) expect((st.sql.match(/\?/g) ?? []).length).toBe(st.params.length);
  });

  it("refuses a step list past the cap rather than building a batch that would be split", () => {
    const stepRows = Array.from({ length: MAX_ROUTINE_STEPS + 1 }, (_, i) => step(`s-${i}`, i));
    expect(() => templateSaveStatements({ templateId: "t-1", row, loadedUpdatedAt: "loaded", stepRows, memberId: "a2" })).toThrow(RangeError);
    expect(() => templateCreatePlan({ row, stepRows, memberId: "a2" })).toThrow(RangeError);
    expect(client).toMatch(/if \(stepRows\.length > MAX_ROUTINE_STEPS\)/);
  });

  it("creates a new template first, on its own, then every step in one batch, with an undo", () => {
    const plan = templateCreatePlan({ row, stepRows: [step("s-1", 0), step("s-2", 1)], memberId: "a2" });
    expect(plan.create.sql).toMatch(/^INSERT INTO app_routines__templates /);
    expect(plan.steps.map((st) => st.sql.split(" (")[0])).toEqual(["INSERT INTO app_routines__template_steps"]);
    expect([plan.create, ...plan.steps].some((st) => st.requireChanges)).toBe(false);
    expect(plan.undo).toEqual({ sql: "DELETE FROM app_routines__templates WHERE id=?", params: ["t-1"] });
    const cols = plan.steps[0].sql.match(/\(([^)]*)\) VALUES/)[1].split(",");
    expect(plan.steps[0].params.length).toBe(cols.length * 2);
    for (let r = 0; r < 2; r++) expect(plan.steps[0].params[r * cols.length + cols.indexOf("created_by_member_id")]).toBe("a2");
    // An edit builder that silently accepted a new template would bring the
    // one-batch create back.
    expect(() => templateSaveStatements({ row, stepRows: [], memberId: "a2" })).toThrow(TypeError);
  });

  it("the client sends the create in two requests and undoes the template when its steps fail", () => {
    expect(client).toMatch(/await dbBatch\(\[plan\.create\]\);\s*if \(!plan\.steps\.length\) return;\s*try \{\s*await dbBatch\(plan\.steps\);\s*\} catch \(err\) \{\s*await dbBatch\(\[plan\.undo\]\)\.catch\(\(\) => \{\}\);\s*throw err;/);
    expect(client.match(/await createTemplate\(templateCreatePlan\(/g)).toHaveLength(2);
  });

  it("the client surfaces a refused save instead of leaving the dialog silently open", () => {
    expect(client).toMatch(/try \{\s*if \(templateId\) \{[^}]*const statements = templateSaveStatements\(\{ templateId, row, loadedUpdatedAt, doomedStepIds, stepRows, memberId: currentMember\(\)\.id \}\);\s*await dbBatch\(statements\);/);
  });
});
