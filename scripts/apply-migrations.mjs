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
 *   node scripts/apply-migrations.mjs 0039 0040 0041
 *   node scripts/apply-migrations.mjs --all
 *
 * A bare invocation with no arguments is refused: applying every migration to a
 * live project should be an explicit `--all`, never the default for a typo.
 *
 * To find out what a project is missing, run `npm run verify:supabase` — this
 * script keeps no ledger of what it has applied, so it cannot compute "pending"
 * itself.
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
  process.env.SUPABASE_PROJECT_REF?.trim() || new URL(SUPABASE_URL).hostname.split(".")[0];

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
  const flags = args.filter((arg) => arg.startsWith("--"));
  const names = args.filter((arg) => !arg.startsWith("--"));

  // Unknown flags used to be skipped silently, which made a typo — or the
  // `--pending` flag this script never implemented — apply ZERO migrations while
  // still printing a success line. Failing loudly is the only safe behaviour for
  // a tool that writes schema.
  const unknown = flags.filter((flag) => flag !== "--all");
  if (unknown.length > 0) {
    console.error(
      `Unknown flag(s): ${unknown.join(", ")}\n\n` +
        "Supported usage:\n" +
        "  node scripts/apply-migrations.mjs --all\n" +
        "  node scripts/apply-migrations.mjs 0039 0040 0041\n\n" +
        "There is no --pending: this script keeps no record of what it has\n" +
        "applied. To find out what a project is missing, run\n" +
        "  npm run verify:supabase\n" +
        "which reports absent relations, views, RPCs, and columns.",
    );
    process.exit(1);
  }

  if (flags.includes("--all")) return all;
  if (names.length === 0) {
    console.error(
      "Nothing to do: no migration was named.\n\n" +
        "  node scripts/apply-migrations.mjs --all\n" +
        "  node scripts/apply-migrations.mjs 0039 0040 0041\n\n" +
        "Run `npm run verify:supabase` first to see what is actually missing.",
    );
    process.exit(1);
  }

  const selected = [];
  for (const arg of names) {
    // A numeric prefix can match MORE than one file: this repo currently has two
    // 0034_* and two 0035_* migrations. `find` would return only the first and
    // silently skip the rest, so match ALL of them and report what was resolved.
    const matches = all.filter((name) => name === arg || name.startsWith(`${arg}_`));
    if (matches.length === 0) {
      console.error(`No migration matches "${arg}".`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.log(`"${arg}" matches ${matches.length} migrations; all will be applied:`);
      for (const name of matches) console.log(`  - ${name}`);
    }
    selected.push(...matches);
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
