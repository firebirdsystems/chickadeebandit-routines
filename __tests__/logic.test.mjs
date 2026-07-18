import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, ROUTINE_ICONS, normalizeIcon, canCompleteStep, completionSummary, sortByOrder, visibleTemplates } from "../src/logic.js";

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

  it("limits non-adult completion to steps assigned to them", () => {
    const child = { id: "kid-1", role: "child" };
    expect(canCompleteStep({ assigned_member_id: "kid-1" }, child)).toBe(true);
    // Unassigned steps have no owner under the run_steps owner_only policy, so
    // the server rejects a non-adult write — don't offer a Done button.
    expect(canCompleteStep({ assigned_member_id: null }, child)).toBe(false);
    expect(canCompleteStep({ assigned_member_id: "kid-2" }, child)).toBe(false);
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
