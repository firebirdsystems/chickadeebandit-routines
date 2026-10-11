import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, ROUTINE_ICONS, normalizeIcon, canCompleteStep, completionSummary, sortByOrder, visibleTemplates, searchableFields, isTemplateStepSupervisor, canArchiveTemplate, canEditTemplate, packetSaveStatements, MAX_BATCH_STATEMENTS, MAX_ROUTINE_STEPS, staleRuns, staleRunClosures, visibilityChoices, ACTIVE_RUNS_SHOWN, ACTIVE_STEPS_READ } from "../src/logic.js";
import { readFileSync } from "node:fs";

describe("routines logic", () => {
  it("ships the planned starter templates", () => {
    expect(STARTER_TEMPLATES.map((t) => t.title)).toEqual([
      "School Morning",
      "Bedtime",
      "Weekly Reset",
      "Travel Departure",
      "Babysitter Night",
      "Pet Sitter"
    ]);
  });

  it("marks a run complete when required steps are done", () => {
    const summary = completionSummary([
      { required: 1, status: "done" },
      { required: 1, status: "done" },
      { required: 0, status: "skipped" }
    ]);
    expect(summary.isComplete).toBe(true);
    expect(summary.doneRequired).toBe(2);
  });

  it("keeps required pending steps from completing a run", () => {
    expect(completionSummary([
      { required: 1, status: "done" },
      { required: 1, status: "pending" }
    ]).isComplete).toBe(false);
  });

  it("lets a run with nothing required be finished", () => {
    expect(completionSummary([
      { required: 0, status: "done" },
      { required: 0, status: "pending" }
    ]).isComplete).toBe(true);
    expect(completionSummary([]).isComplete).toBe(true);
  });

  it("limits non-adult completion to steps assigned to them", () => {
    const child = { id: "kid-1", role: "child" };
    expect(canCompleteStep({ assigned_member_id: "kid-1" }, child)).toBe(true);
    // Unassigned steps have no owner under the run_steps owner_only policy, so
    // the server rejects a non-adult write — don't offer a Done button.
    expect(canCompleteStep({ assigned_member_id: null }, child)).toBe(false);
    expect(canCompleteStep({ assigned_member_id: "kid-2" }, child)).toBe(false);
    // Supervision is passed in, never inferred from the role (see isRunSupervisor).
    expect(canCompleteStep({ assigned_member_id: "kid-2" }, { id: "a1", role: "adult" })).toBe(false);
    expect(canCompleteStep({ assigned_member_id: "kid-2" }, { id: "a1", role: "adult" }, true)).toBe(true);
  });

  it("gives every starter step a picture for the kiosk tile grid", () => {
    // On the kiosk a pre-reader navigates by emoji alone, so a starter step
    // with no icon would be a blank tile.
    for (const template of STARTER_TEMPLATES) {
      for (const step of template.steps) {
        expect(step[5], `${template.title} / ${step[0]}`).toBeTruthy();
      }
    }
  });

  it("offers a picker palette with no duplicates", () => {
    expect(ROUTINE_ICONS.length).toBeGreaterThan(20);
    expect(new Set(ROUTINE_ICONS).size).toBe(ROUTINE_ICONS.length);
  });

  it("normalizes an icon down to a single character", () => {
    expect(normalizeIcon("🪥")).toBe("🪥");
    expect(normalizeIcon("  🎒  ")).toBe("🎒");
    // The picker has a free-text escape hatch; a pasted paragraph must not
    // become a tile label.
    expect(normalizeIcon("brush your teeth")).toBe("b");
    expect(normalizeIcon("")).toBe("");
    expect(normalizeIcon(null)).toBe("");
    expect(normalizeIcon(undefined)).toBe("");
  });

  it("sorts steps and hides archived templates", () => {
    expect(sortByOrder([{ sort_order: 2 }, { sort_order: 0 }]).map((x) => x.sort_order)).toEqual([0, 2]);
    expect(visibleTemplates([{ id: "a" }, { id: "b", archived_at: "now" }]).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("searchableFields", () => {
  it("matches on description and category, not just the routine title", () => {
    const fields = searchableFields({ title: "Out the door", description: "shoes, bag, water bottle", category: "morning" });
    expect(fields).toContain("shoes, bag, water bottle");
    expect(fields).toContain("morning");
  });
});

describe("who may edit or archive a template", () => {
  const owner = { id: "a1", role: "adult" };
  const other = { id: "a2", role: "adult" };
  const template = { id: "t-1", owner_member_id: "a1" };
  const home = { tenantKind: "household", adult: true };
  const child = { tenantKind: "household", adult: false };
  const participant = { tenantKind: "shared_space", spaceKind: "general", adult: true, isAdmin: false };
  const steward = { tenantKind: "shared_space", spaceKind: "general", adult: true, isAdmin: true };
  const coparent = { tenantKind: "shared_space", spaceKind: "coparenting", adult: true, isAdmin: true };

  it("step supervision is every adult at home, the steward in a space, nobody when co-parenting", () => {
    expect(isTemplateStepSupervisor(home)).toBe(true);
    expect(isTemplateStepSupervisor(child)).toBe(false);
    expect(isTemplateStepSupervisor(participant)).toBe(false);
    expect(isTemplateStepSupervisor(steward)).toBe(true);
    expect(isTemplateStepSupervisor(coparent)).toBe(false);
    expect(isTemplateStepSupervisor()).toBe(false);
  });

  it("the owner may always edit and archive their own template", () => {
    for (const tenant of [home, participant, steward, coparent]) {
      expect(canEditTemplate(template, owner, tenant)).toBe(true);
      expect(canArchiveTemplate(template, owner, tenant)).toBe(true);
    }
  });

  it("a household adult may edit and archive anyone's template, a child may not", () => {
    expect(canEditTemplate(template, other, home)).toBe(true);
    expect(canArchiveTemplate(template, other, home)).toBe(true);
    expect(canEditTemplate(template, { id: "k1", role: "child" }, child)).toBe(false);
    expect(canArchiveTemplate(template, { id: "k1", role: "child" }, child)).toBe(false);
  });

  it("a space participant may do neither to someone else's template; the steward may do both", () => {
    expect(canEditTemplate(template, other, participant)).toBe(false);
    expect(canArchiveTemplate(template, other, participant)).toBe(false);
    expect(canEditTemplate(template, other, steward)).toBe(true);
    expect(canArchiveTemplate(template, other, steward)).toBe(true);
  });

  it("a co-parenting steward may archive the other parent's template but not edit it", () => {
    expect(canArchiveTemplate(template, other, coparent)).toBe(true);
    expect(canEditTemplate(template, other, coparent)).toBe(false);
  });

  it("no member means no ownership", () => {
    expect(canEditTemplate(template, null, participant)).toBe(false);
    expect(canArchiveTemplate(template, null, participant)).toBe(false);
  });
});

describe("packetSaveStatements", () => {
  const packet = {
    id: "p1", template_id: "t1", run_id: null, title: "Sitter", safe_notes: "", include_contacts: 0,
    include_health_notes: 0, include_documents: 0, created_by_member_id: "a1", created_at: "now", updated_at: "now"
  };
  const stepRows = (n) => Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, packet_id: "p1", source_step_id: `src${i}`, title_snapshot: `Step ${i}`, details_snapshot: "", sort_order: i
  }));

  it("writes the packet first, then every step, in one batch", () => {
    const statements = packetSaveStatements({ packet, stepRows: stepRows(8) });
    expect(statements[0].sql).toContain("app_routines__caregiver_packets ");
    expect(statements[0].params).toHaveLength(11);
    const stepParams = statements.slice(1).flatMap((s) => s.params);
    expect(stepParams).toHaveLength(8 * 6);
    expect(stepParams.filter((v) => v === "p1")).toHaveLength(8);
  });

  it("fits the largest routine in one batch and under the parameter limit", () => {
    const statements = packetSaveStatements({ packet, stepRows: stepRows(MAX_ROUTINE_STEPS) });
    expect(statements.length).toBeLessThanOrEqual(MAX_BATCH_STATEMENTS);
    for (const statement of statements) expect(statement.params.length).toBeLessThanOrEqual(100);
  });

  it("saves a packet with no steps as the packet alone", () => {
    expect(packetSaveStatements({ packet, stepRows: [] })).toHaveLength(1);
  });

  it("refuses more steps than a routine can hold", () => {
    expect(() => packetSaveStatements({ packet, stepRows: stepRows(MAX_ROUTINE_STEPS + 1) })).toThrow(RangeError);
  });
});

describe("runs left open from earlier days", () => {
  const runs = [
    { id: "old-done", status: "active", run_date: "2026-10-01" },
    { id: "old-open", status: "active", run_date: "2026-10-08" },
    { id: "today", status: "active", run_date: "2026-10-10" },
    { id: "tomorrow", status: "active", run_date: "2026-10-11" },
    { id: "old-closed", status: "completed", run_date: "2026-10-01" },
    { id: "undated", status: "active", run_date: "" },
  ];
  const steps = [
    { run_id: "old-done", required: 1, status: "done" },
    { run_id: "old-done", required: 0, status: "pending" },
    { run_id: "old-open", required: 1, status: "done" },
    { run_id: "old-open", required: 1, status: "pending" },
  ];

  it("are the active runs dated before today", () => {
    expect(staleRuns(runs, "2026-10-10").map((r) => r.id)).toEqual(["old-done", "old-open"]);
  });

  it("are completed when every required step is done and canceled otherwise", () => {
    const closures = staleRunClosures(runs, steps, "2026-10-10", "NOW");
    expect(closures.map((c) => [c.runId, c.status, c.completed_at, c.canceled_at])).toEqual([
      ["old-done", "completed", "NOW", null],
      ["old-open", "canceled", null, "NOW"],
    ]);
  });

  it("close only a run that is still active", () => {
    const [first] = staleRunClosures(runs, steps, "2026-10-10", "NOW");
    expect(first.statement.sql).toMatch(/WHERE id=\? AND status='active'$/);
    expect(first.statement.params).toEqual(["completed", "NOW", null, "old-done"]);
  });
});

describe("visibilityChoices", () => {
  it("offers the two current choices for a template that uses one of them", () => {
    expect(visibilityChoices("everyone").map(([v]) => v)).toEqual(["everyone", "adults"]);
    expect(visibilityChoices("adults").map(([v]) => v)).toEqual(["everyone", "adults"]);
    expect(visibilityChoices(undefined).map(([v]) => v)).toEqual(["everyone", "adults"]);
  });

  it("keeps a stored value it no longer offers, so an edit cannot widen it", () => {
    expect(visibilityChoices("members")).toEqual([["everyone", "Everyone"], ["adults", "Adults"], ["members", "Only me"]]);
  });
});

describe("the launch reads", () => {
  it("read every loaded run's steps whole, well under the hub's row and byte ceilings", () => {
    expect(ACTIVE_RUNS_SHOWN * MAX_ROUTINE_STEPS).toBeLessThanOrEqual(ACTIVE_STEPS_READ);
    expect(ACTIVE_STEPS_READ).toBeLessThan(5000);
    // A stored step row measures about 540 bytes; the hub refuses a reply over 2 MB.
    expect(ACTIVE_STEPS_READ * 540).toBeLessThan(2 * 1024 * 1024 * 0.6);
  });

  it("are the statements the manifest preloads, with the same caps", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(manifest.preload.runs.sql.endsWith(`LIMIT ${ACTIVE_RUNS_SHOWN}`)).toBe(true);
    expect(manifest.preload.run_steps.sql.endsWith(`LIMIT ${ACTIVE_STEPS_READ}`)).toBe(true);
  });
});
