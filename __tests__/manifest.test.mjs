import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf8"));

describe("manifest.json", () => {
  it("declares the routines app contract", () => {
    expect(manifest.id).toBe("routines");
    expect(manifest.entrypoint).toBe("index.html");
    expect(manifest.runtime).toBe("static");
    expect(manifest.storage).toBe("db");
    expect(manifest.db_encryption).toBe("default");
  });

  it("declares family context and event integration", () => {
    expect(manifest.data_access.reads).toEqual(["family.members", "family.groups", "family.documents"]);
    expect(manifest.data_access.writes).toEqual([]);
    expect(manifest.publishes).toEqual(["routine.started", "routine.completed", "routine.step_completed"]);
    expect(manifest.alert_on).toEqual(["routine.completed"]);
  });

  it("protects caregiver packet tables as adult-only", () => {
    expect(manifest.row_policies.caregiver_packets.kind).toBe("adult_only");
    expect(manifest.row_policies.caregiver_packet_steps.kind).toBe("adult_only");
  });

  it("lets a template's owner maintain steps and audience rows written by others", () => {
    for (const table of ["template_steps", "template_audience"]) {
      const policy = manifest.row_policies[table];
      expect(policy.kind).toBe("inherit_visibility");
      expect(policy.parent_table).toBe("templates");
      expect(policy.parent_owner_actions).toEqual(["update", "delete"]);
    }
  });

  it("lets a guest start a run while only an adult removes one", () => {
    const runs = manifest.row_policies.runs;
    expect(runs.kind).toBe("owner_or_visibility");
    expect(runs.delete_adult_only).toBe(true);
    expect(runs.column_write_acls.visibility).toEqual({ writable_by: [] });
    // Writes follow reads, and every other column is an adult's or the
    // starter's, so a child or guest changes only the runs they started.
    expect(runs.write_visibility_scoped).toBe(true);
    const migrationsDir = join(__dirname, "../migrations");
    const sql = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(migrationsDir, f), "utf-8")).join("\n");
    const created = sql.match(/CREATE TABLE IF NOT EXISTS app_routines__runs \(([\s\S]*?)\n\);/)[1];
    const columns = [
      ...created.split("\n").map((l) => l.trim().match(/^([a-z_]+) [A-Z]/)?.[1]).filter((c) => c && c !== "PRIMARY" && c !== "FOREIGN"),
      ...[...sql.matchAll(/ALTER TABLE app_routines__runs ADD COLUMN ([a-z_]+)/g)].map((m) => m[1]),
    ];
    expect(columns).toContain("step_count");
    const locked = ["started_by_member_id", "visibility", "step_count"];
    for (const column of columns) {
      if (locked.includes(column)) expect(runs.column_write_acls[column].writable_by).toEqual([]);
      else expect(runs.column_write_acls[column], column).toEqual({ writable_by: ["adult", "owner"] });
    }
    expect(manifest.row_policies.run_steps).toEqual({ kind: "owner_only", member_column: "assigned_member_id", adults_bypass: true });
  });

  it("has source and migration files", () => {
    expect(existsSync(join(__dirname, "../src/index.html"))).toBe(true);
    expect(existsSync(join(__dirname, "../src/logic.js"))).toBe(true);
    expect(existsSync(join(__dirname, "../migrations/001_init.sql"))).toBe(true);
  });

  it("declares household_id on every app table", () => {
    const sql = readFileSync(join(__dirname, "../migrations/001_init.sql"), "utf8");
    const tables = sql.match(/CREATE TABLE IF NOT EXISTS app_routines__[^{]+?\(/g) ?? [];
    expect(tables.length).toBe(7);
    expect((sql.match(/household_id TEXT NOT NULL DEFAULT ''/g) ?? []).length).toBe(7);
  });
});
