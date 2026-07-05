#!/usr/bin/env node
import http from "http";
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const CACHE = path.join(__dirname, ".hub-sdk.js");
const SDK_URL = "https://www.chickadeebandit.com/hub-sdk.js";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
const APP_BASE = `/run/${manifest.id}/`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function serve(res, filepath) {
  try {
    const body = fs.readFileSync(filepath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filepath).toLowerCase()] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Not found: ${filepath}`);
  }
}

function fetchSdk() {
  return new Promise((resolve, reject) => {
    https.get(SDK_URL, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
}

async function ensureSdk() {
  const cacheExists = fs.existsSync(CACHE);
  const cacheAge = cacheExists ? Date.now() - fs.statSync(CACHE).mtimeMs : Infinity;
  if (cacheExists && cacheAge <= MAX_AGE_MS) return;

  process.stdout.write(cacheExists ? "Refreshing hub-sdk.js... " : "Fetching hub-sdk.js... ");
  try {
    fs.writeFileSync(CACHE, await fetchSdk(), "utf8");
    console.log("done.");
  } catch (error) {
    if (cacheExists) {
      console.log(`fetch failed (${error.message}), using cached copy.`);
      return;
    }
    console.error(`\nERROR: Could not fetch hub-sdk.js: ${error.message}`);
    process.exit(1);
  }
}

await ensureSdk();

http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/hub-sdk.js") {
    serve(res, CACHE);
    return;
  }
  const stripped = url.startsWith(APP_BASE) ? url.slice(APP_BASE.length) : url.replace(/^\//, "");
  serve(res, path.join(__dirname, "src", stripped === "" ? "index.html" : stripped));
}).listen(PORT, () => {
  console.log(`App:        ${manifest.name} (${manifest.id})`);
  console.log(`Dev server: http://localhost:${PORT}`);
});
