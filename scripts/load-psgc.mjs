#!/usr/bin/env node
/**
 * Load canonical PSGC locality reference data into Supabase (decision D14).
 *
 * SOURCE (approved): Philippine Statistics Authority (PSA) Philippine Standard
 * Geographic Code, via the open machine-readable mirror https://psgc.gitlab.io/api.
 * This script fetches a live snapshot and records the fetch date below in the
 * console output; the tables it fills are created by migration 0035.
 *
 * The app stores the 6-digit city prefix as `city_code` and the 9-digit barangay
 * code as `barangay_code`; this loader derives those from the official codes.
 *
 * Usage:  node scripts/load-psgc.mjs
 * Idempotent: upserts on the primary-key code, so re-running refreshes cleanly.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(resolve(repoRoot, ".env.seed"));
loadEnv(resolve(repoRoot, "apps", "mobile", ".env.local"));

const URL = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.seed.");
  process.exit(1);
}
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const BASE = "https://psgc.gitlab.io/api";
async function getJson(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function upsertBatched(table, rows, conflict) {
  const size = 1000;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const { error } = await admin.from(table).upsert(batch, { onConflict: conflict });
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
    process.stdout.write(`\r  ${table}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log(`PSGC snapshot fetched ${new Date().toISOString()} from ${BASE}\n`);

  const [provinces, cities, barangays] = await Promise.all([
    getJson("provinces.json"),
    getJson("cities-municipalities.json"),
    getJson("barangays.json"),
  ]);
  const provinceName = new Map(provinces.map((p) => [p.code, p.name]));

  const cityRows = cities.map((c) => ({
    code: c.code,
    city6: c.code.slice(0, 6),
    name: c.name,
    province_name: c.provinceCode ? (provinceName.get(c.provinceCode) ?? null) : null,
    region_code: c.regionCode,
    is_city: Boolean(c.isCity),
  }));

  const barangayRows = barangays.map((b) => {
    const parent9 = b.cityCode || b.municipalityCode || `${b.code.slice(0, 6)}000`;
    return { code: b.code, name: b.name, city6: parent9.slice(0, 6), city_code9: parent9 };
  });

  console.log(
    `Loading ${cityRows.length} cities/municipalities and ${barangayRows.length} barangays...\n`,
  );
  await upsertBatched("psgc_cities_municipalities", cityRows, "code");
  await upsertBatched("psgc_barangays", barangayRows, "code");

  // Verify: counts + orphaned barangays (city6 with no matching city row).
  const cityCodes = new Set(cityRows.map((c) => c.city6));
  const orphans = barangayRows.filter((b) => !cityCodes.has(b.city6)).length;
  const { count: cityCount } = await admin
    .from("psgc_cities_municipalities")
    .select("*", { count: "exact", head: true });
  const { count: brgyCount } = await admin
    .from("psgc_barangays")
    .select("*", { count: "exact", head: true });
  console.log(
    `\nLoaded. Cities in DB: ${cityCount}, Barangays in DB: ${brgyCount}, orphaned barangays: ${orphans}`,
  );
}

main().catch((e) => {
  console.error(`\nLoad failed: ${e.message}`);
  process.exit(1);
});
