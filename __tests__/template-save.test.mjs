/**
 * Saving a template rebuilds its steps: delete every step of the template, then
 * insert the edited list. Two defects lived in that sequence.
 *
 * 1. run_steps.template_step_id references template_steps(id) with no ON DELETE
 *    action, so with foreign keys enforced the wholesale delete FAILED on any
 *    template that had ever been run — after the template UPDATE had already
 *    committed. The references are released first now; every run step carries
 *    its own title/details/icon snapshots, which is why the column is nullable.
 * 2. The delete and the inserts were issued one statement at a time, so an
 *    interruption anywhere in the middle left the routine with no steps at all.
 *    They now go as one transactional batch.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = readFileSync(join(__dirname, "../src/index.html"), "utf-8");
const schema = readFileSync(join(__dirname, "../migrations/001_init.sql"), "utf-8");

describe("saveTemplate", () => {
  it("releases run_steps references before deleting template steps", () => {
    const release = client.indexOf("UPDATE app_routines__run_steps SET template_step_id = NULL");
    const del = client.indexOf("DELETE FROM app_routines__template_steps WHERE template_id=?");
    expect(release).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(release);
  });

  it("keeps the referencing column nullable — the release would abort otherwise", () => {
    expect(schema).toMatch(/template_step_id TEXT,/);
    expect(schema).toMatch(/FOREIGN KEY \(template_step_id\) REFERENCES app_routines__template_steps\(id\)/);
  });

  it("writes the rebuild as one batch, not one statement at a time", () => {
    expect(client).toMatch(/await dbBatchAll\(statements\)/);
    expect(client).not.toMatch(/await db\("INSERT INTO app_routines__template_steps/);
    expect(client).not.toMatch(/await db\("DELETE FROM app_routines__template_steps/);
  });

  it("chunks at the /api/db batch cap", () => {
    expect(client).toMatch(/const MAX_BATCH = 25;/);
  });
});
