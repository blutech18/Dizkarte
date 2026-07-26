/**
 * Dizkarte — real Supabase data seeder.
 *
 * Creates the real development accounts in Supabase Auth and provisions their
 * roles/verification/Tasker state, seeds service categories, and creates a few
 * sample OPEN tasks. Replaces the former hardcoded in-app directories.
 *
 * SECURITY: requires the Supabase SERVICE-ROLE key. Never commit it and never
 * paste it into chat. Provide it via the environment or a git-ignored
 * `.env.seed` file at the repo root:
 *
 *   SUPABASE_URL=https://<your-project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
 *
 * Prerequisites: migrations 0001–0015 must already be applied to the target
 * project (so `handle_new_user`, RLS, and the schema exist).
 *
 * Run:  node scripts/seed-supabase.mjs
 * The script is idempotent — safe to run repeatedly.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Development account roster and shared password.
 *
 * Read from `packages/config/src/dev/dev-accounts.json`, the single source the
 * Admin login page and the mobile sign-in screen also read, so the credentials
 * an app displays can never drift from the ones actually provisioned here.
 *
 * Loaded with `fs` rather than `import` because this is a plain Node script and
 * the config package ships TypeScript sources, not a build.
 *
 * Emails use the reserved, non-deliverable `.invalid` TLD, so none of these
 * addresses can receive mail — password-reset and email-confirmation flows must
 * be tested with a real inbox instead.
 */
const ROSTER = JSON.parse(
  readFileSync(resolve(repoRoot, "packages/config/src/dev/dev-accounts.json"), "utf8"),
);

const ACCOUNT_PASSWORD = ROSTER.password;
const ACCOUNTS = ROSTER.accounts.map((account) => ({
  email: account.email,
  displayName: account.displayName,
  capabilities: account.capabilities,
  verified: account.verified,
  ...(account.tasker ? { tasker: account.tasker } : {}),
  password: ACCOUNT_PASSWORD,
}));

const CATEGORIES = [
  { slug: "home-cleaning", name: "Home Cleaning", sort_order: 1 },
  { slug: "basic-plumbing", name: "Basic Plumbing", sort_order: 2 },
  { slug: "basic-electrical", name: "Basic Electrical Assistance", sort_order: 3 },
  { slug: "furniture-assembly", name: "Furniture Assembly", sort_order: 4 },
  { slug: "handyman", name: "Handyman & Minor Repairs", sort_order: 5 },
  { slug: "moving-help", name: "Moving Assistance", sort_order: 6 },
  { slug: "delivery-errands", name: "Local Delivery & Errands", sort_order: 7 },
  { slug: "yard-outdoor", name: "Yard & Outdoor Help", sort_order: 8 },
];

/**
 * Tasker specialties. These back the profile editor's picker — without them a
 * Tasker has nothing to claim and `tasker_specialties` can never be populated.
 */
const SPECIALTIES = [
  { slug: "deep-cleaning", name: "Deep Cleaning", sort_order: 1 },
  { slug: "pipe-repair", name: "Pipe & Faucet Repair", sort_order: 2 },
  { slug: "appliance-install", name: "Appliance Installation", sort_order: 3 },
  { slug: "flat-pack-assembly", name: "Flat-pack Assembly", sort_order: 4 },
  { slug: "painting", name: "Painting & Patching", sort_order: 5 },
  { slug: "heavy-lifting", name: "Heavy Lifting & Moving", sort_order: 6 },
  { slug: "motorbike-delivery", name: "Motorbike Delivery", sort_order: 7 },
  { slug: "gardening", name: "Gardening & Lawn Care", sort_order: 8 },
];

/**
 * PSGC locality codes. `localityCodeSchema` in `@dizkarte/domain` accepts digits
 * only (6–10), so seeded locations must use the bare numeric code — a prefixed
 * form like "PH-137404" would be rejected by the very forms that create tasks
 * and profiles, and would not match a city filter coming from the app.
 */
const QUEZON_CITY = { cityCode: "137404", barangayCode: "137404001" };

async function findUserByEmail(email) {
  // Paginate through auth users (dev rosters are tiny; one page is enough).
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureAuthUser(account) {
  const existing = await findUserByEmail(account.email);
  if (existing) {
    // Keep the password deterministic and confirmed for dev sign-in.
    await admin.auth.admin.updateUserById(existing.id, {
      password: account.password,
      email_confirm: true,
      user_metadata: { display_name: account.displayName },
    });
    return { id: existing.id, created: false };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { display_name: account.displayName },
  });
  if (error || !data.user) throw new Error(`createUser(${account.email}) failed: ${error?.message}`);
  return { id: data.user.id, created: true };
}

async function ensureProfile(userId, displayName) {
  // The handle_new_user trigger creates this; upsert makes the seed robust even
  // if the trigger is absent or the user pre-existed without metadata.
  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, display_name: displayName }, { onConflict: "id" });
  if (error) throw new Error(`profiles upsert failed: ${error.message}`);
}

async function ensureCapability(userId, capability) {
  const { data, error } = await admin
    .from("user_capabilities")
    .select("id")
    .eq("user_id", userId)
    .eq("capability", capability)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`capability check failed: ${error.message}`);
  if (data) return;
  const { error: insErr } = await admin
    .from("user_capabilities")
    .insert({ user_id: userId, capability });
  if (insErr) throw new Error(`capability grant failed: ${insErr.message}`);
}

async function ensureVerificationApproved(userId) {
  const { data } = await admin
    .from("verification_cases")
    .select("id,status")
    .eq("user_id", userId)
    .eq("status", "APPROVED")
    .maybeSingle();
  if (data) return;
  const now = new Date().toISOString();
  const { error } = await admin.from("verification_cases").insert({
    user_id: userId,
    status: "APPROVED",
    version: 1,
    submitted_at: now,
    decided_at: now,
  });
  if (error) throw new Error(`verification seed failed: ${error.message}`);
}

async function ensureTasker(userId, applicationStatus) {
  const { data: existingApp } = await admin
    .from("tasker_applications")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const now = new Date().toISOString();
  if (!existingApp) {
    const { error } = await admin.from("tasker_applications").insert({
      user_id: userId,
      status: applicationStatus,
      bio: "Experienced local Tasker (development seed account).",
      experience: "Several years of hands-on service work across Metro Manila.",
      submitted_at: now,
      ...(applicationStatus === "APPROVED" ? { decided_at: now } : {}),
    });
    if (error) throw new Error(`tasker_applications seed failed: ${error.message}`);
  }
  if (applicationStatus === "APPROVED") {
    const { error } = await admin.from("tasker_profiles").upsert(
      {
        user_id: userId,
        public_bio: "Reliable, friendly, and on time.",
        public_experience: "Cleaning, repairs, and delivery.",
        approved_at: now,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`tasker_profiles seed failed: ${error.message}`);
  }
}

async function seedCategories() {
  const { error } = await admin
    .from("categories")
    .upsert(CATEGORIES.map((c) => ({ ...c, active: true })), { onConflict: "slug" });
  if (error) throw new Error(`categories seed failed: ${error.message}`);
}

async function seedSpecialties() {
  const { error } = await admin
    .from("specialties")
    .upsert(SPECIALTIES.map((s) => ({ ...s, active: true })), { onConflict: "slug" });
  if (error) throw new Error(`specialties seed failed: ${error.message}`);
}

/**
 * Record the platform fee explicitly as 0 basis points.
 *
 * `app.platform_fee_bps()` coalesces a missing row to 0, so behaviour is
 * unchanged — but an explicit row makes "no fee yet" a recorded decision rather
 * than an absent setting, and gives the Admin finance page something real to
 * display. The commercial fee model is a pending Client decision; when it is
 * approved this value is the single place to change.
 */
async function seedPlatformFee() {
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: "platform_fee_bps", typed_value: 0 }, { onConflict: "key" });
  if (error) throw new Error(`app_settings seed failed: ${error.message}`);
}

/**
 * Bring any previously seeded locations onto the numeric PSGC format. Earlier
 * runs wrote a "PH-" prefixed code, which `localityCodeSchema` rejects, so a
 * city filter from the app would never match those rows.
 */
async function normalizeSeededLocalityCodes() {
  const { error: cityErr } = await admin
    .from("task_public_locations")
    .update({ city_code: QUEZON_CITY.cityCode })
    .eq("city_code", "PH-137404");
  if (cityErr) throw new Error(`city_code normalize failed: ${cityErr.message}`);
  const { error: brgyErr } = await admin
    .from("task_public_locations")
    .update({ barangay_code: QUEZON_CITY.barangayCode })
    .eq("barangay_code", "PH-137404001");
  if (brgyErr) throw new Error(`barangay_code normalize failed: ${brgyErr.message}`);
}

async function seedSampleTasks(clientId) {
  const { data: cats } = await admin.from("categories").select("id,slug");
  const bySlug = new Map((cats ?? []).map((c) => [c.slug, c.id]));
  const samples = [
    {
      slug: "delivery-errands",
      title: "Pick up and deliver documents same day",
      description: "Need someone to pick up sealed documents and deliver across the city today.",
      budget: 40000,
      landmark: "Near The Fort Strip",
      lng: 121.0509,
      lat: 14.5509,
    },
    {
      slug: "moving-help",
      title: "Move a 2-seater sofa across town",
      description: "Need help moving a sofa and a few boxes to a new unit. Have a pickup truck.",
      budget: 150000,
      landmark: "Near Ayala Malls Cloverleaf",
      lng: 120.9911,
      lat: 14.6572,
    },
    {
      slug: "basic-plumbing",
      title: "Fix leaking kitchen faucet",
      description: "Faucet has been dripping for a week. Need a plumber with tools for a same-day fix.",
      budget: 80000,
      landmark: "Near SM North EDSA",
      lng: 121.0327,
      lat: 14.6572,
    },
  ];
  for (const s of samples) {
    const categoryId = bySlug.get(s.slug);
    if (!categoryId) continue;
    // Skip if a task with this exact title already exists for the client.
    const { data: existing } = await admin
      .from("tasks")
      .select("id")
      .eq("client_id", clientId)
      .eq("title", s.title)
      .maybeSingle();
    if (existing) continue;
    const now = new Date().toISOString();
    const { data: task, error } = await admin
      .from("tasks")
      .insert({
        client_id: clientId,
        category_id: categoryId,
        title: s.title,
        description: s.description,
        budget_centavos: s.budget,
        same_day: true,
        status: "OPEN",
        published_at: now,
      })
      .select("id")
      .single();
    if (error) throw new Error(`task insert failed: ${error.message}`);
    const point = `SRID=4326;POINT(${s.lng} ${s.lat})`;
    const { error: pubErr } = await admin.from("task_public_locations").insert({
      task_id: task.id,
      city_code: QUEZON_CITY.cityCode,
      barangay_code: QUEZON_CITY.barangayCode,
      landmark: s.landmark,
      approximate_point: point,
    });
    if (pubErr) throw new Error(`public location insert failed: ${pubErr.message}`);
    const { error: privErr } = await admin.from("task_private_locations").insert({
      task_id: task.id,
      exact_address: "123 Sample Street, Quezon City (development seed)",
      exact_point: point,
    });
    if (privErr) throw new Error(`private location insert failed: ${privErr.message}`);
  }
}

async function main() {
  console.log(`Seeding Supabase project at ${SUPABASE_URL}\n`);

  await seedCategories();
  console.log("✓ Categories");

  await seedSpecialties();
  console.log("✓ Specialties");

  await normalizeSeededLocalityCodes();
  console.log("✓ Locality codes normalized to numeric PSGC");

  await seedPlatformFee();
  console.log("✓ Platform fee setting (explicit 0 bps pending an approved fee model)");

  let clientId = null;
  for (const account of ACCOUNTS) {
    const { id, created } = await ensureAuthUser(account);
    await ensureProfile(id, account.displayName);
    for (const cap of account.capabilities) await ensureCapability(id, cap);
    if (account.verified) await ensureVerificationApproved(id);
    if (account.tasker) await ensureTasker(id, account.tasker);
    if (account.email.startsWith("client@")) clientId = id;
    console.log(`${created ? "+ created" : "= updated"}  ${account.email}  [${account.capabilities.join(", ")}]`);
  }

  if (clientId) {
    try {
      await seedSampleTasks(clientId);
      console.log("✓ Sample tasks");
    } catch (err) {
      console.warn(`! Sample tasks skipped: ${err.message}`);
    }
  }

  console.log("\nDone. Accounts and roles are provisioned in Supabase.");
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
