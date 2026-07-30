#!/usr/bin/env node
/**
 * Apply migration files to the linked Supabase project.
 *
 * Uses the Management API's SQL endpoint, which authenticates with a personal
 * access token. That matters because the database password is not available to
 * this repo, so `supabase db push` and any direct `psql` connection are out.
 *
 * Credentials are read from `.env.seed` (git-ignored) and never printed. The
 * token is sent only to api.supabase.com.
 *
 * Usage:
 *   node scripts/apply-migrations.mjs 0020 0021 0022 0023
 *   node scripts/apply-migrations.mjs --pending
 *
 * Every migration in this repo is written to be re-runnable (`create or
 * replace`, `drop ... if exists`, `on conflict do nothing`), so re-applying one
 * is a no-op rather than an error.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(repoRoot, "supabase", "migrations");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvFile(resolve(repoRoot, ".env.seed"));

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();

if (!TOKEN) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN.\n" +
      "Create one at https://supabase.com/dashboard/account/tokens and add it to\n" +
      ".env.seed as:  SUPABASE_ACCESS_TOKEN=sbp_...",
  );
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL in .env.seed.");
  process.exit(1);
}

const projectRef =
  process.env.SUPABASE_PROJECT_REF?.trim() ||
  new URL(SUPABASE_URL).hostname.split(".")[0];

/** Run one SQL string. Returns the endpoint's rows, or throws with the detail. */
async function runSql(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message ?? parsed.error ?? text;
    } catch {
      // Non-JSON body; the raw text is the best available detail.
    }
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

function allMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
}

function resolveRequested(args) {
  const all = allMigrations();
  if (args.length === 0 || args.includes("--all")) return all;

  const selected = [];
  for (const arg of args) {
    if (arg.startsWith("--")) continue;
    const match = all.find((name) => name === arg || name.startsWith(`${arg}_`));
    if (!match) {
      console.error(`No migration matches "${arg}".`);
      process.exit(1);
    }
    selected.push(match);
  }
  // Order by file name, not argument order: migrations depend on their sequence.
  return all.filter((name) => selected.includes(name));
}

async function main() {
  const files = resolveRequested(process.argv.slice(2));
  console.log(`Applying ${files.length} migration(s) to project ${projectRef}\n`);

  // Fail fast on a bad token before touching any schema.
  await runSql("select 1;");

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    process.stdout.write(`  ${file} ... `);
    try {
      await runSql(sql);
      console.log("ok");
    } catch (error) {
      console.log("FAILED");
      console.error(`\n${file} did not apply:\n  ${error.message}\n`);
      console.error("Stopping here. Later migrations were not attempted.");
      process.exit(1);
    }
  }

  console.log("\nAll requested migrations applied.");
  console.log("Run `npm run verify:supabase` to confirm the exposed schema.");
}

main().catch((error) => {
  console.error(`Apply failed: ${error.message}`);
  process.exit(1);
});
