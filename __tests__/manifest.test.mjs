import { existsSync, readFileSync } from "fs";
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
