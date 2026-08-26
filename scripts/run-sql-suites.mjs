#!/usr/bin/env node
/**
 * Apply every migration to a THROWAWAY PostgreSQL container and run the SQL
 * suites against it.
 *
 * Why a container rather than `supabase start`: the suites need the Supabase
 * `auth` schema and the `authenticated`/`service_role` roles, which the
 * `supabase/postgres` image already ships, but a full local stack binds a range
 * of ports that is not always available (on the developer host used for the
 * 2026-08-23 run, port 54322 was inside a reserved Windows range). One container
 * with no published ports needs nothing from the host but Docker, which makes the
 * same command work locally and in CI.
 *
 * It NEVER touches a real project: the container is created, used, and removed,
 * and no connection string from the environment is read.
 *
 * Usage:
 *   node scripts/run-sql-suites.mjs
 *   node scripts/run-sql-suites.mjs --keep     # leave the container for debugging
 *   node scripts/run-sql-suites.mjs --image supabase/postgres:17.6.1.147
 *
 * Exit code is non-zero if any migration fails to apply or any suite reports a
 * failure, so it is usable as a CI gate.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(repoRoot, "supabase", "migrations");
const testsDir = resolve(repoRoot, "supabase", "tests");

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const imageFlag = args.indexOf("--image");
const IMAGE = imageFlag >= 0 ? args[imageFlag + 1] : "supabase/postgres:17.6.1.147";
const CONTAINER = process.env.SQL_SUITE_CONTAINER ?? "dizkarte_sql_suites";

/** The database superuser in the Supabase image; `postgres` cannot own storage.*  */
const DB_USER = "supabase_admin";

/** Suites in dependency-free order. Each is self-contained and rolls back. */
const SUITES = [
  "ledger_and_constraints",
  "rls_enabled",
  "security_hardening",
  "milestone3_reviews_notifications",
  "conversation_read_state",
  "task_feed_filters",
  "report_submission",
  "admin_case_subject",
];

/** Test-only harness applied before the migrations; see the file's header. */
const STORAGE_SHIM = "_local_storage_shim.sql";

function docker(argv, options = {}) {
  return spawnSync("docker", argv, { encoding: "utf8", ...options });
}

function requireDocker() {
  const probe = docker(["info", "--format", "{{.ServerVersion}}"]);
  if (probe.status !== 0) {
    console.error(
      "Docker is not available (or its daemon is not running).\n" +
        "This script needs it to create a throwaway PostgreSQL container.",
    );
    process.exit(1);
  }
  return probe.stdout.trim();
}

function psql(sqlFileInContainer) {
  return docker([
    "exec",
    CONTAINER,
    "psql",
    "-U",
    DB_USER,
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    sqlFileInContainer,
  ]);
}

function waitForReady(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = docker(["exec", CONTAINER, "pg_isready", "-U", DB_USER, "-d", "postgres"]);
    if (probe.status === 0) {
      // `pg_isready` can succeed while the bootstrap scripts are still running,
      // which would make the first migration race the role/schema setup.
      const roles = docker([
        "exec",
        CONTAINER,
        "psql",
        "-U",
        DB_USER,
        "-d",
        "postgres",
        "-tAc",
        "select count(*) from pg_roles where rolname in ('authenticated','service_role','anon')",
      ]);
      if (roles.status === 0 && Number(roles.stdout.trim()) === 3) return true;
    }
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{},1500)"]);
  }
  return false;
}

function cleanup() {
  docker(["rm", "-f", CONTAINER], { stdio: "ignore" });
}

function main() {
  const dockerVersion = requireDocker();
  console.log(`Docker server ${dockerVersion}; image ${IMAGE}`);

  const migrations = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  if (migrations.length === 0) {
    console.error("No migrations found.");
    process.exit(1);
  }
  if (!existsSync(resolve(testsDir, STORAGE_SHIM))) {
    console.error(`Missing ${STORAGE_SHIM}; the storage policies cannot apply without it.`);
    process.exit(1);
  }

  cleanup();
  const run = docker(["run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=postgres", IMAGE]);
  if (run.status !== 0) {
    console.error(`Could not start the container:\n${run.stderr}`);
    process.exit(1);
  }

  let failed = false;
  try {
    if (!waitForReady()) {
      console.error("The database did not become ready in time.");
      process.exit(1);
    }

    docker(["exec", CONTAINER, "mkdir", "-p", "/tmp/mig", "/tmp/tests"]);
    for (const name of migrations) {
      docker(["cp", resolve(migrationsDir, name), `${CONTAINER}:/tmp/mig/${name}`]);
    }
    for (const name of readdirSync(testsDir).filter((n) => n.endsWith(".sql"))) {
      docker(["cp", resolve(testsDir, name), `${CONTAINER}:/tmp/tests/${name}`]);
    }

    const shim = psql(`/tmp/tests/${STORAGE_SHIM}`);
    if (shim.status !== 0) {
      console.error(`Storage shim failed:\n${shim.stderr}`);
      process.exit(1);
    }

    process.stdout.write(`Applying ${migrations.length} migrations `);
    for (const name of migrations) {
      const result = psql(`/tmp/mig/${name}`);
      if (result.status !== 0) {
        console.log("");
        console.error(`\n${name} did not apply:\n${result.stderr}`);
        process.exit(1);
      }
      process.stdout.write(".");
    }
    console.log(" ok\n");

    for (const suite of SUITES) {
      const result = psql(`/tmp/tests/${suite}.sql`);
      const output = `${result.stdout}\n${result.stderr}`;
      const passes = (output.match(/PASS:/g) ?? []).length;
      const failures = (output.match(/FAIL:/g) ?? []).length;
      const errored = result.status !== 0;
      if (errored || failures > 0) {
        failed = true;
        console.log(`  ${suite}: FAILED (${passes} passed, ${failures} failed)`);
        for (const line of output.split(/\r?\n/)) {
          if (/FAIL:|ERROR/.test(line)) console.log(`    ${line.trim()}`);
        }
      } else {
        console.log(`  ${suite}: ${passes} passed`);
      }
    }
  } finally {
    if (keep) {
      console.log(`\nContainer ${CONTAINER} left running (--keep).`);
    } else {
      cleanup();
    }
  }

  if (failed) {
    console.error("\nSQL suites FAILED.");
    process.exit(1);
  }
  console.log("\nAll migrations applied and all SQL suites passed.");
}

main();
