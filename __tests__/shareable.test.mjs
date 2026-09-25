import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));
const page = readFileSync(join(__dirname, "../src/index.html"), "utf-8");

const item = manifest.shareable?.packet;

/**
 * A share link is an anonymous read that skips row policies. Here that matters
 * more than usual: templates carry per-member visibility (owner_or_visibility),
 * and runs hold who did what, when. A packet is the copy an adult has already
 * cut down for a caregiver, so it is the only thing that may be shared, and
 * its projection must not reach back into the tables it was cut from.
 */
describe("shareable.packet", () => {
  it("anchors on caregiver_packets, the adult-only table built for this", () => {
    expect(Object.keys(manifest.shareable)).toEqual(["packet"]);
    expect(item.table).toBe("caregiver_packets");
    expect(manifest.row_policies.caregiver_packets.kind).toBe("adult_only");
    expect(item.id_column ?? "id").toBe("id");
    expect(item.title_column).toBe("title");
  });

  it("projects only the packet's notes and its snapshotted steps", () => {
    expect(item.columns.map((c) => c.column)).toEqual(["safe_notes"]);
    expect(item.feed.table).toBe("caregiver_packet_steps");
    expect(item.feed.fk_column).toBe("packet_id");
    expect(item.feed.columns.map((c) => c.column)).toEqual(["title_snapshot", "details_snapshot"]);
  });

  it("never reads templates, runs or anything keyed to a member", () => {
    const text = JSON.stringify(item);
    for (const t of ["templates", "template_steps", "template_audience", "runs", "run_steps", "run_details"]) {
      expect(text).not.toContain(`"${t}"`);
    }
    expect(text).not.toMatch(/member_id/);
    expect(item.aggregates).toBeUndefined();
  });

  // Steps are ordered in SQL; an encrypted sort key orders by ciphertext.
  it("orders steps by the plaintext sort_order, first step first", () => {
    expect(item.feed.order_column).toBe("sort_order");
    expect(item.feed.order).toBe("oldest");
    expect(manifest.db_plaintext_columns).toContain("sort_order");
  });

  it("is read-only and is the item type the page mints", () => {
    expect(item.submit).toBeUndefined();
    expect(item.files).toBeUndefined();
    expect(page).toMatch(/itemType:\s*"packet"/);
  });

  // The include_* flags print a reminder on the in-app view; the public page
  // has no such line, so the panel has to say it instead.
  it("tells the sharer that contacts, health notes and documents are not on the page", () => {
    const scope = page.match(/scopeHtml:\s*\(\)\s*=>\s*"([^"]+)"/)?.[1] ?? "";
    expect(scope).toMatch(/Contacts, health notes and documents are never on the page/);
  });
});
