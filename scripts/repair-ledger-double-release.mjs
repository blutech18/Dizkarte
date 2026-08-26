/**
 * Dizkarte — ledger repair: reverse fabricated RELEASE_TO_TASKER transactions.
 *
 * WHAT WENT WRONG
 * ---------------
 * A booking's protected hold was released twice: once by the real
 * `confirm_completion_and_release` RPC (booking-scoped, key `rel_<booking_id>`)
 * and once by an ad-hoc service-role insert with its own key and a null
 * `booking_id`. Both transactions balanced to zero, so the existing
 * transaction-level trigger accepted them, but the Tasker's PROTECTED_HOLD was
 * debited twice against a single capture: the derived protected balance went
 * negative and TASKER_AVAILABLE was credited money no Client ever paid.
 *
 * HOW THIS REPAIRS IT
 * -------------------
 * The ledger is append-only, so nothing is deleted or edited. For each
 * fabricated release this posts one balanced ADJUSTMENT transaction that
 * reverses exactly its entries (sign-flipped), leaving both the error and its
 * correction in the audit trail. The idempotency key is derived from the
 * offending transaction id, so re-running is a no-op.
 *
 * A release is treated as fabricated when it is NOT booking-scoped
 * (`booking_id is null`) — the real RPC always sets it — or when it duplicates
 * another release for the same booking. Nothing else is touched. Run with
 * `--dry-run` first: it reports what it would post and changes nothing.
 *
 * SECURITY: requires the SERVICE-ROLE key (see scripts/seed-supabase.mjs).
 *
 * Usage:
 *   node scripts/repair-ledger-double-release.mjs --dry-run
 *   node scripts/repair-ledger-double-release.mjs
 *
 * Prerequisite: migration 0036 must be applied (it adds the ADJUSTMENT type).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const dryRun = process.argv.includes("--dry-run");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvFile(resolve(repoRoot, ".env.seed"));

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "\nMissing credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the\n" +
      "environment or a git-ignored .env.seed file at the repo root, then re-run.\n",
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const peso = (centavos) => `${centavos < 0 ? "-" : ""}PHP ${(Math.abs(centavos) / 100).toFixed(2)}`;

async function main() {
  const [{ data: accounts, error: accErr }, { data: entries, error: entErr }] = await Promise.all([
    db.from("ledger_accounts").select("id,owner_id,owner_type,account_type"),
    db.from("ledger_entries").select("id,account_id,amount_centavos,transaction_id"),
  ]);
  if (accErr || entErr) throw new Error(`ledger read failed: ${(accErr ?? entErr).message}`);

  const { data: txs, error: txErr } = await db
    .from("ledger_transactions")
    .select("id,booking_id,type,idempotency_key,created_at")
    .order("created_at", { ascending: true });
  if (txErr) throw new Error(`ledger transaction read failed: ${txErr.message}`);

  const accById = new Map(accounts.map((a) => [a.id, a]));
  const entriesByTx = new Map();
  for (const e of entries) {
    const list = entriesByTx.get(e.transaction_id) ?? [];
    list.push(e);
    entriesByTx.set(e.transaction_id, list);
  }

  const balanceOf = (accountId) =>
    entries
      .filter((e) => e.account_id === accountId)
      .reduce((sum, e) => sum + Number(e.amount_centavos), 0);

  // Identify fabricated releases.
  const releases = txs.filter((t) => t.type === "RELEASE_TO_TASKER");
  const seenBooking = new Set();
  const fabricated = [];
  for (const tx of releases) {
    if (tx.booking_id === null) {
      fabricated.push({ tx, why: "release is not booking-scoped (booking_id is null)" });
      continue;
    }
    if (seenBooking.has(tx.booking_id)) {
      fabricated.push({ tx, why: `duplicate release for booking ${tx.booking_id}` });
      continue;
    }
    seenBooking.add(tx.booking_id);
  }

  const alreadyReversed = new Set(
    txs.filter((t) => t.type === "ADJUSTMENT").map((t) => t.idempotency_key),
  );

  console.log(`releases found: ${releases.length}`);
  console.log(`fabricated releases: ${fabricated.length}`);
  const negativeOwned = accounts.filter((a) => a.owner_id && balanceOf(a.id) < 0);
  for (const a of negativeOwned) {
    console.log(
      `NEGATIVE owned balance: ${a.account_type} owner=${a.owner_id} ${peso(balanceOf(a.id))}`,
    );
  }
  if (fabricated.length === 0) {
    console.log("Nothing to repair.");
    return;
  }

  for (const { tx, why } of fabricated) {
    const key = `adj_reverse_${tx.id}`;
    const legs = entriesByTx.get(tx.id) ?? [];
    console.log(`\nfabricated ${tx.type} ${tx.id} (${tx.idempotency_key})`);
    console.log(`  reason: ${why}`);
    for (const leg of legs) {
      const acc = accById.get(leg.account_id);
      console.log(
        `  reversing ${peso(-Number(leg.amount_centavos))} on ${acc.account_type} owner=${acc.owner_id ?? "PLATFORM"}`,
      );
    }
    if (legs.length < 2) throw new Error(`refusing to reverse ${tx.id}: fewer than two entries`);
    if (alreadyReversed.has(key)) {
      console.log("  already reversed — skipping");
      continue;
    }
    if (dryRun) {
      console.log("  [dry run] no changes written");
      continue;
    }

    const { data: adjTx, error: adjErr } = await db
      .from("ledger_transactions")
      .insert({
        booking_id: null,
        type: "ADJUSTMENT",
        idempotency_key: key,
        metadata: {
          reverses_transaction_id: tx.id,
          reverses_idempotency_key: tx.idempotency_key,
          reason: why,
          note: "Append-only correction of a fabricated release; see migration 0036.",
        },
      })
      .select("id")
      .single();
    if (adjErr) throw new Error(`adjustment transaction insert failed: ${adjErr.message}`);

    const { error: legErr } = await db.from("ledger_entries").insert(
      legs.map((leg) => ({
        transaction_id: adjTx.id,
        account_id: leg.account_id,
        amount_centavos: -Number(leg.amount_centavos),
      })),
    );
    if (legErr) throw new Error(`adjustment entries insert failed: ${legErr.message}`);
    console.log(`  posted ADJUSTMENT ${adjTx.id}`);
  }

  // Re-read and report the resulting owned balances.
  const { data: after } = await db.from("ledger_entries").select("account_id,amount_centavos");
  const totals = new Map();
  for (const e of after ?? []) {
    totals.set(e.account_id, (totals.get(e.account_id) ?? 0) + Number(e.amount_centavos));
  }
  console.log("\nowned balances after repair:");
  for (const a of accounts.filter((x) => x.owner_id)) {
    console.log(`  ${a.account_type} owner=${a.owner_id} ${peso(totals.get(a.id) ?? 0)}`);
  }
}

main().catch((error) => {
  console.error(`\nRepair failed: ${error.message}\n`);
  process.exit(1);
});
