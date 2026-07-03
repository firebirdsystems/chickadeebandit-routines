import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, canCompleteStep, completionSummary, sortByOrder, visibleTemplates } from "../src/logic.js";

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

  it("limits non-adult completion to assigned or unassigned steps", () => {
    const child = { id: "kid-1", role: "child" };
    expect(canCompleteStep({ assigned_member_id: "kid-1" }, child)).toBe(true);
    expect(canCompleteStep({ assigned_member_id: null }, child)).toBe(true);
    expect(canCompleteStep({ assigned_member_id: "kid-2" }, child)).toBe(false);
  });

  it("sorts steps and hides archived templates", () => {
    expect(sortByOrder([{ sort_order: 2 }, { sort_order: 0 }]).map((x) => x.sort_order)).toEqual([0, 2]);
    expect(visibleTemplates([{ id: "a" }, { id: "b", archived_at: "now" }]).map((x) => x.id)).toEqual(["a"]);
  });
});
