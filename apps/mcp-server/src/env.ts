import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "node:url";

function loadIfExists(p: string, label?: string) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: false });
    console.log(`[MCP] dotenv loaded: ${label ?? ""}${p}`);
    return true;
  }
  return false;
}

// Resolve module directory in both ESM and CJS
const moduleDir =
  // eslint-disable-next-line no-undef
  typeof __dirname !== "undefined"
    // @ts-ignore - __dirname exists in CJS
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// Candidate directories: current working dir (how you launched the app), the app dir, and repo root.
const appDir = path.resolve(moduleDir, "..");
const cwd = process.cwd();
const repoRoot = path.resolve(appDir, "..", "..");

// Load base .env first, then .env.local to override if present
const candidates: string[] = [
  path.join(cwd, ".env"),
  path.join(cwd, ".env.local"),
  path.join(appDir, ".env"),
  path.join(appDir, ".env.local"),
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
];

let anyLoaded = false;
for (const p of candidates) anyLoaded = loadIfExists(p) || anyLoaded;

if (!anyLoaded) {
  console.warn("[MCP] dotenv: no .env files found in expected locations");
}
console.log("[MCP] CWD:", cwd, "appDir:", appDir);
