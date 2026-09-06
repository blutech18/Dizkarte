#!/usr/bin/env node
/**
 * Verify that the applied Supabase schema exposes everything the apps depend on.
 *
 * Read-only by design: it fetches the PostgREST OpenAPI description of the
 * project and inspects which tables/views and RPCs are exposed. Nothing is
 * called and nothing is mutated, so this is safe to run against any
 * environment. Credentials are read from `.env.seed` (git-ignored) and are
 * never printed.
 *
 * Usage: node scripts/verify-supabase-schema.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY)?.trim();

if (!SUPABASE_URL || !KEY) {
  console.error("Missing SUPABASE_URL or a Supabase key. Populate .env.seed first.");
  process.exit(1);
}

/** Relations (tables + views) the apps read. */
const EXPECTED_RELATIONS = [
  // identity
  "profiles",
  "user_capabilities",
  "verification_cases",
  "verification_documents",
  // taskers
  "tasker_applications",
  "tasker_profiles",
  "specialties",
  "tasker_specialties",
  "service_areas",
  "portfolio_items",
  "payout_methods",
  // marketplace
  "categories",
  "tasks",
  "task_public_locations",
  "task_private_locations",
  "task_media",
  "task_questions",
  "offers",
  "bookings",
  "booking_events",
  "offer_events",
  // messaging / notifications
  "conversations",
  "conversation_participants",
  "messages",
  "message_media",
  "notifications",
  "notification_preferences",
  // finance
  "payment_intents",
  "provider_events",
  "ledger_accounts",
  "ledger_transactions",
  "ledger_entries",
  "refunds",
  "withdrawals",
  // safety / ops
  "reviews",
  "reports",
  "disputes",
  "support_tickets",
  "ticket_messages",
  "evidence",
  "moderation_actions",
  "audit_logs",
  "app_settings",
  // registration / localities / guided questions (0034, 0035, 0038)
  "billing_addresses",
  "psgc_cities_municipalities",
  "psgc_barangays",
  "task_question_definitions",
  "task_answers",
  // views
  "public_task_feed",
  "public_tasker_profiles",
  "public_profiles",
  "admin_report_queue",
  "admin_dispute_queue",
  "admin_ticket_queue",
  "admin_verification_queue",
];

/** RPCs grouped by the migration that introduced them. */
const EXPECTED_RPCS = {
  "0008 / 0011 marketplace": [
    "search_open_tasks",
    "publish_task",
    "submit_offer",
    "select_offer",
    "start_booking",
    "request_completion",
    "confirm_completion_and_release",
    "open_dispute",
    "submit_review",
    "request_withdrawal",
    "decide_verification",
  ],
  "0012 admin": ["decide_tasker_application", "admin_refund", "admin_freeze"],
  "0013 admin assign / transition / audited reads": [
    "admin_assign_report",
    "admin_assign_dispute",
    "admin_assign_ticket",
    "admin_assign_verification",
    "admin_transition_report",
    "admin_transition_dispute",
    "admin_transition_ticket",
    "admin_read_report_case",
    "admin_read_dispute_case",
    "admin_read_ticket_case",
    "admin_read_ticket_messages",
    "admin_read_conversation_messages",
    "admin_read_conversation_media",
    "admin_read_verification_case",
    "admin_read_evidence",
    "admin_read_task_location",
    "admin_authorize_object_read",
  ],
  "0016 admin ops (NEW)": [
    "admin_set_account_status",
    "admin_moderate_task",
    "admin_create_category",
    "admin_rename_category",
    "admin_set_category_active",
    "admin_reorder_category",
  ],
  "0017 offer withdrawal (NEW)": ["withdraw_offer"],
  "0018 profile self-service (NEW)": ["update_tasker_public_profile"],
  "0019 own ledger balances (NEW)": ["my_ledger_balances"],
  "0021 verification submission + review reveal (NEW)": [
    "start_verification",
    "submit_verification",
    "get_review_pair",
  ],
  "0023 review moderation (NEW)": ["admin_moderate_review"],
  "0024 geospatial feed search (NEW)": ["search_task_feed"],
  "0025 media moderation (NEW)": ["admin_moderate_task_media"],
  "0027 abandoned checkout recovery (NEW)": ["cancel_unpaid_booking"],
  "0030 tasker application submission (NEW)": ["submit_tasker_application"],
  "0032 admin operational settings (NEW)": ["admin_update_setting"],
  "0034 offer registration (NEW)": [
    "save_registration_mobile",
    "add_payout_method",
    "save_billing_address",
    "my_offer_registration_status",
  ],
  "0040 owner task cancellation (NEW)": ["cancel_own_task"],
  // 0020 (notification emission) intentionally contributes nothing here: it is
  // made up of `app.*` helpers and AFTER triggers, neither of which PostgREST
  // describes. Confirm it applied by causing an event (submit an offer) and
  // checking that a `notifications` row appears for the counterparty.
  //
  // 0022 (realtime publication) likewise adds no schema objects — it only makes
  // `messages` and `notifications` members of `supabase_realtime`. Confirm it in
  // the dashboard under Database > Publications, or by watching chat update
  // without a manual refresh.
  //
  // 0028 (avatars bucket) and 0035's storage policies act on `storage.*`, which
  // PostgREST does not describe. 0031 (notification alert categories), 0033 and
  // 0036 (ledger guards) change CHECK constraints and `app.*` trigger functions
  // only. None of these can be asserted here; verify them via the dashboard or a
  // behavioural test.
  //
  // WHEN ADDING A MIGRATION: if it introduces a relation, view, or RPC, list it
  // above. If it only adds columns, add them to EXPECTED_COLUMNS — otherwise
  // this script will pass while the apps break at runtime.
};

/**
 * Functions that must NOT be reachable through PostgREST.
 *
 * `app.derive_user_balances(p_user_id)` is the cautionary case: it was called by
 * name from the client and always 404'd, because schema `app` is not exposed.
 * Exposing it would also be a privacy hole — a caller could pass someone else's
 * id. The caller-scoped `public.my_ledger_balances()` wrapper is the supported
 * entry point.
 */
const FORBIDDEN_RPCS = [
  "derive_user_balances",
  "account_balance",
  "has_active_capability",
  // 0020: notification emission helpers. They run inside SECURITY DEFINER
  // triggers; if either were reachable, a client could mint a notification
  // addressed to any user.
  "notify",
  "notification_category",
  // 0021: the reveal window is read inside get_review_pair, not by callers.
  "review_reveal_days",
];

// Note: process_payment_event / process_refund_event / process_payout_result are
// intentionally service-role-callable (the payment-webhook edge function invokes
// them with the service key), so they legitimately appear under the service
// role and are neither expected-for-clients nor forbidden here.

/** Views added alongside the newest migrations. */
const EXPECTED_NEW_VIEWS = {
  "0016 admin ops (NEW)": ["admin_category_history"],
  "0017 offer withdrawal (NEW)": ["task_locations_readable", "task_private_locations_readable"],
  "0023 review moderation (NEW)": ["admin_review_queue"],
  "0025 media moderation (NEW)": ["admin_task_media_queue"],
  "0029 public profile reads (NEW)": ["public_profiles"],
  "0051 read-path aggregates (NEW)": [
    "admin_ledger_totals",
    "admin_platform_fee_events",
    "user_context",
  ],
};

/**
 * Columns that later migrations ADD to relations that already existed.
 *
 * This check exists because relation/RPC presence is not enough. A migration
 * that only adds a column leaves every relation and function already in place,
 * so this script reported "All expected schema objects are present" while
 * `tasks.time_of_day`, `tasks.location_type`, and
 * `task_public_locations.dropoff_landmark` were all missing — and the mobile app
 * failed at runtime with `400 Bad Request` the moment it named one of them in a
 * PostgREST `select`. Column drift is the failure mode this catches.
 *
 * The column names come from the same OpenAPI description already fetched above
 * (`definitions[relation].properties`), so this costs no extra request and stays
 * read-only.
 */
const EXPECTED_COLUMNS = {
  "0034 offer registration": {
    profiles: ["mobile_verified_at"],
    // Free-text address fields, deliberately not PSGC codes: a billing address
    // is a provider/tax artefact, not a discoverable task locality.
    billing_addresses: ["user_id", "line1", "city", "postal_code", "country"],
  },
  "0037 support ticket subject": {
    support_tickets: ["subject_type", "subject_id"],
  },
  "0038 guided category questions": {
    task_question_definitions: ["category_id", "label", "input_kind", "required", "sort_order"],
    task_answers: ["task_id", "question_id", "answer"],
  },
  "0039 task time of day": {
    tasks: ["time_of_day"],
  },
  "0041 task location type + drop-off": {
    tasks: ["location_type"],
    task_public_locations: ["dropoff_landmark"],
    // The coordinate-readable view must expose it too, or the owner-facing read
    // silently loses the field even though the base table has it.
    task_locations_readable: ["dropoff_landmark"],
  },
};

async function fetchOpenApi() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: "application/openapi+json" },
  });
  if (!response.ok) {
    throw new Error(`PostgREST schema request failed with HTTP ${response.status}`);
  }
  return response.json();
}

function report(label, names, present) {
  const missing = names.filter((name) => !present.has(name));
  const mark = missing.length === 0 ? "OK  " : "FAIL";
  console.log(`  [${mark}] ${label} — ${names.length - missing.length}/${names.length}`);
  for (const name of missing) console.log(`         missing: ${name}`);
  return missing;
}

async function main() {
  console.log(`Verifying schema exposed by ${SUPABASE_URL}\n`);
  const spec = await fetchOpenApi();
  const paths = Object.keys(spec.paths ?? {});

  const relations = new Set(
    paths
      .filter((p) => p.startsWith("/") && !p.startsWith("/rpc/") && p.length > 1)
      .map((p) => p.slice(1)),
  );
  const rpcs = new Set(
    paths.filter((p) => p.startsWith("/rpc/")).map((p) => p.slice("/rpc/".length)),
  );
  // Swagger 2.0 (what PostgREST emits) carries per-relation column definitions.
  const definitions = spec.definitions ?? spec.components?.schemas ?? {};

  const failures = [];

  console.log("Tables and views");
  failures.push(...report("core relations", EXPECTED_RELATIONS, relations));

  console.log("\nViews added by the newest migrations");
  for (const [label, names] of Object.entries(EXPECTED_NEW_VIEWS)) {
    failures.push(...report(label, names, relations));
  }

  console.log("\nColumns added by later migrations");
  for (const [label, byRelation] of Object.entries(EXPECTED_COLUMNS)) {
    const missing = [];
    let checked = 0;
    for (const [relation, columns] of Object.entries(byRelation)) {
      const present = new Set(Object.keys(definitions[relation]?.properties ?? {}));
      for (const column of columns) {
        checked += 1;
        // An absent relation is already reported above; flag the column against
        // it anyway so the cause is unambiguous rather than silently skipped.
        if (!present.has(column)) missing.push(`${relation}.${column}`);
      }
    }
    const mark = missing.length === 0 ? "OK  " : "FAIL";
    console.log(`  [${mark}] ${label} — ${checked - missing.length}/${checked}`);
    for (const name of missing) console.log(`         missing: ${name}`);
    failures.push(...missing);
  }

  console.log("\nFunctions (RPCs)");
  for (const [label, names] of Object.entries(EXPECTED_RPCS)) {
    failures.push(...report(label, names, rpcs));
  }

  console.log("\nInternal functions that must stay unexposed");
  const leaked = FORBIDDEN_RPCS.filter((name) => rpcs.has(name));
  console.log(`  [${leaked.length === 0 ? "OK  " : "FAIL"}] ${FORBIDDEN_RPCS.length} checked`);
  for (const name of leaked) console.log(`         unexpectedly exposed: ${name}`);
  failures.push(...leaked);

  console.log(`\nExposed by PostgREST: ${relations.size} relations, ${rpcs.size} functions.`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} expected object(s) missing. Apply the pending migrations.`);
    process.exit(1);
  }
  console.log("\nAll expected schema objects are present.");
}

main().catch((error) => {
  console.error(`Verification failed: ${error.message}`);
  process.exit(1);
});
