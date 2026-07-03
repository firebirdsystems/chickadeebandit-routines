#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = new URL(".", import.meta.url).pathname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

function readDir(dir, base = "") {
  const files = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, readDir(path.join(dir, entry.name), rel));
    else files[rel] = fs.readFileSync(path.join(dir, entry.name), "utf8");
  }
  return files;
}

const files = readDir(SRC);
if (!files["index.html"]) {
  console.error("Error: src/index.html is required");
  process.exit(1);
}

const migrations = [];
if (manifest.storage === "db") {
  const dir = path.join(ROOT, "migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const match = file.match(/^(\d+)/);
    if (!match) {
      console.error(`Error: migration file must start with a number: ${file}`);
      process.exit(1);
    }
    migrations.push({
      version: parseInt(match[1], 10),
      sql: fs.readFileSync(path.join(dir, file), "utf8").trim()
    });
  }
}

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "bundle.json"), JSON.stringify({ manifest, migrations, files }, null, 2), "utf8");
console.log(`Built ${Object.keys(files).length} file(s) -> dist/bundle.json`);
