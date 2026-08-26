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
  ...(account.profile ? { profile: account.profile } : {}),
  password: ACCOUNT_PASSWORD,
}));

/**
 * Service catalog.
 *
 * Slugs match the illustration filenames in
 * `apps/mobile/assets/icons` and the list in
 * `apps/mobile/src/components/task/categoryArt.ts`, so every category renders
 * with its own artwork in the home grid. Renaming a slug here means renaming
 * the asset and that list too.
 */
const CATEGORIES = [
  { slug: "gardening", name: "Gardening", sort_order: 1 },
  { slug: "painting", name: "Painting", sort_order: 2 },
  { slug: "cleaning", name: "Cleaning", sort_order: 3 },
  { slug: "removals", name: "Removals", sort_order: 4 },
  { slug: "repairs-installations", name: "Repairs & Installations", sort_order: 5 },
  { slug: "copywriting", name: "Copywriting", sort_order: 6 },
  { slug: "data-entry", name: "Data Entry", sort_order: 7 },
  { slug: "furniture-assembly", name: "Furniture Assembly", sort_order: 8 },
];

/**
 * Superseded slugs from the previous catalog.
 *
 * They are deactivated rather than deleted: `tasks.category_id` references them,
 * so deleting would either fail the foreign key or orphan existing tasks.
 * Deactivating hides them from the picker while keeping history intact.
 */
/** Sample task title -> the live category slug it should belong to. */
const SAMPLE_TASK_CATEGORY = {
  "Pick up and deliver documents same day": "removals",
  "Move a 2-seater sofa across town": "removals",
  "Fix leaking kitchen faucet": "repairs-installations",
};

const RETIRED_CATEGORY_SLUGS = [
  "home-cleaning",
  "basic-plumbing",
  "basic-electrical",
  "handyman",
  "moving-help",
  "delivery-errands",
  "yard-outdoor",
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
  if (error || !data.user)
    throw new Error(`createUser(${account.email}) failed: ${error?.message}`);
  return { id: data.user.id, created: true };
}

async function ensureProfile(userId, displayName, profile) {
  // The handle_new_user trigger creates this; upsert makes the seed robust even
  // if the trigger is absent or the user pre-existed without metadata.
  //
  // Optional profile columns (mobile, locality, language, bio) come from the
  // roster's `profile` block so the Client/Tasker account pages render real
  // details instead of empty fields. Mobile numbers are stored in the same
  // canonical +63 form the app writes via `phMobileSchema`, and locality codes
  // are bare numeric PSGC so they satisfy `localityCodeSchema` and match a city
  // filter coming from the app.
  const row = { id: userId, display_name: displayName };
  if (profile) {
    if (profile.mobile !== undefined) row.mobile = profile.mobile;
    if (profile.cityCode !== undefined) row.city_code = profile.cityCode;
    if (profile.barangayCode !== undefined) row.barangay_code = profile.barangayCode;
    if (profile.language !== undefined) row.language = profile.language;
    if (profile.bio !== undefined) row.bio = profile.bio;
  }
  const { error } = await admin.from("profiles").upsert(row, { onConflict: "id" });
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

async function ensureTasker(userId, account) {
  const applicationStatus = account.tasker;
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
    return;
  }
  // A non-approved application (e.g. IN_REVIEW) drives the Admin approvals
  // queue. Give it real specialties and a service area so the review detail is
  // complete rather than a bare bio — the same shape a real submission writes.
  await seedApplicantDetails(userId, account.profile);
}

/**
 * Attach a couple of real specialties and one service area to a pending
 * applicant, matching what `submit_tasker_application` writes in production so
 * the Admin queue shows a fully-formed application. Idempotent.
 */
async function seedApplicantDetails(userId, profile) {
  const { data: specs } = await admin.from("specialties").select("id,slug");
  const bySlug = new Map((specs ?? []).map((s) => [s.slug, s.id]));
  const rows = ["deep-cleaning", "flat-pack-assembly"]
    .map((slug) => bySlug.get(slug))
    .filter(Boolean)
    .map((specialty_id) => ({ user_id: userId, specialty_id }));
  if (rows.length > 0) {
    const { error } = await admin
      .from("tasker_specialties")
      .upsert(rows, { onConflict: "user_id,specialty_id" });
    if (error) throw new Error(`applicant specialties upsert failed: ${error.message}`);
  }

  const cityCode = profile?.cityCode ?? "137404";
  const barangayCode = profile?.barangayCode ?? null;
  const { data: existingArea } = await admin
    .from("service_areas")
    .select("id")
    .eq("user_id", userId)
    .eq("city_code", cityCode)
    .maybeSingle();
  if (!existingArea) {
    const { error } = await admin
      .from("service_areas")
      .insert({ user_id: userId, city_code: cityCode, barangay_code: barangayCode });
    if (error) throw new Error(`applicant service area seed failed: ${error.message}`);
  }
}

async function seedCategories() {
  const { error } = await admin.from("categories").upsert(
    CATEGORIES.map((c) => ({ ...c, active: true })),
    { onConflict: "slug" },
  );
  if (error) throw new Error(`categories seed failed: ${error.message}`);

  // Retire the previous catalog without breaking tasks that reference it.
  const { error: retireError } = await admin
    .from("categories")
    .update({ active: false })
    .in("slug", RETIRED_CATEGORY_SLUGS);
  if (retireError) throw new Error(`category retire failed: ${retireError.message}`);
}

/**
 * Re-point sample tasks that still reference a retired category, so the seeded
 * feed shows a live category name instead of an inactive one.
 */
async function repointSampleTasks() {
  const { data: cats } = await admin.from("categories").select("id,slug,active");
  const bySlug = new Map((cats ?? []).map((c) => [c.slug, c]));
  const retiredIds = new Set(
    (cats ?? []).filter((c) => RETIRED_CATEGORY_SLUGS.includes(c.slug)).map((c) => c.id),
  );
  if (retiredIds.size === 0) return;

  const { data: tasks } = await admin.from("tasks").select("id,title,category_id");
  for (const task of tasks ?? []) {
    if (!retiredIds.has(task.category_id)) continue;
    const replacement = bySlug.get(SAMPLE_TASK_CATEGORY[task.title] ?? "repairs-installations");
    if (!replacement) continue;
    const { error } = await admin
      .from("tasks")
      .update({ category_id: replacement.id })
      .eq("id", task.id);
    if (error) throw new Error(`task re-point failed: ${error.message}`);
  }
}

async function seedSpecialties() {
  const { error } = await admin.from("specialties").upsert(
    SPECIALTIES.map((s) => ({ ...s, active: true })),
    { onConflict: "slug" },
  );
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
      slug: "removals",
      title: "Pick up and deliver documents same day",
      description: "Need someone to pick up sealed documents and deliver across the city today.",
      budget: 40000,
      landmark: "Near The Fort Strip",
      lng: 121.0509,
      lat: 14.5509,
    },
    {
      slug: "removals",
      title: "Move a 2-seater sofa across town",
      description: "Need help moving a sofa and a few boxes to a new unit. Have a pickup truck.",
      budget: 150000,
      landmark: "Near Ayala Malls Cloverleaf",
      lng: 120.9911,
      lat: 14.6572,
    },
    {
      slug: "repairs-installations",
      title: "Fix leaking kitchen faucet",
      description:
        "Faucet has been dripping for a week. Need a plumber with tools for a same-day fix.",
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

/**
 * Give the seeded approved Tasker real trust signals so the Client's
 * "My Taskers" card renders a rating and specialties instead of a bare name.
 * The aggregates mirror what `confirm_completion_and_release` maintains in
 * production; the specialties back the same picker the profile editor uses.
 */
async function enrichSeedTaskerProfile(taskerId) {
  const { error: aggErr } = await admin
    .from("tasker_profiles")
    .update({ completion_count: 12, rating_sum: 43, rating_count: 9 })
    .eq("user_id", taskerId);
  if (aggErr) throw new Error(`tasker aggregates update failed: ${aggErr.message}`);

  const { data: specs } = await admin.from("specialties").select("id,slug");
  const bySlug = new Map((specs ?? []).map((s) => [s.slug, s.id]));
  const wanted = ["deep-cleaning", "pipe-repair", "appliance-install", "flat-pack-assembly"];
  const rows = wanted
    .map((slug) => bySlug.get(slug))
    .filter(Boolean)
    .map((specialty_id) => ({ user_id: taskerId, specialty_id }));
  if (rows.length > 0) {
    const { error: specErr } = await admin
      .from("tasker_specialties")
      .upsert(rows, { onConflict: "user_id,specialty_id" });
    if (specErr) throw new Error(`tasker specialties upsert failed: ${specErr.message}`);
  }
}

/**
 * Seed a real, completed booking between the Client and the approved Tasker so
 * the Client's "My Taskers" list is populated with an actual past working
 * relationship (the section only shows taskers from confirmed-or-later
 * bookings). Builds the full chain the app would: task -> selected offer ->
 * booking -> conversation -> a few messages. Idempotent on the booking's
 * deterministic idempotency key, so re-running the seed does not duplicate it.
 */
async function seedClientTaskerHistory(clientId, taskerId) {
  const { data: cats } = await admin.from("categories").select("id,slug,active");
  const bySlug = new Map((cats ?? []).map((c) => [c.slug, c.id]));
  const categoryId = bySlug.get("cleaning") ?? bySlug.get("repairs-installations") ?? cats?.[0]?.id;
  if (!categoryId) throw new Error("no category available for My Taskers seed");

  const idempotencyKey = `seed-mytaskers-${clientId}-${taskerId}`;
  const { data: existing } = await admin
    .from("bookings")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) return { bookingId: existing.id, created: false };

  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  const budget = 250000; // ₱2,500.00

  const { data: task, error: taskErr } = await admin
    .from("tasks")
    .insert({
      client_id: clientId,
      category_id: categoryId,
      title: "Deep clean 2-bedroom condo (seed)",
      description:
        "Full move-out deep clean for a 2-bedroom unit, including the kitchen and both bathrooms. Seeded completed job that populates the client's My Taskers list.",
      budget_centavos: budget,
      same_day: false,
      status: "COMPLETED",
      published_at: daysAgo(20),
      created_at: daysAgo(21),
    })
    .select("id")
    .single();
  if (taskErr) throw new Error(`mytaskers task insert failed: ${taskErr.message}`);

  const point = `SRID=4326;POINT(121.0327 14.6560)`;
  const { error: pubErr } = await admin.from("task_public_locations").insert({
    task_id: task.id,
    city_code: QUEZON_CITY.cityCode,
    barangay_code: QUEZON_CITY.barangayCode,
    landmark: "Near Trinoma Mall",
    approximate_point: point,
  });
  if (pubErr) throw new Error(`mytaskers public location insert failed: ${pubErr.message}`);
  const { error: privErr } = await admin.from("task_private_locations").insert({
    task_id: task.id,
    exact_address: "88 Seed Street, Quezon City (development seed)",
    exact_point: point,
  });
  if (privErr) throw new Error(`mytaskers private location insert failed: ${privErr.message}`);

  const { data: offer, error: offerErr } = await admin
    .from("offers")
    .insert({
      task_id: task.id,
      tasker_id: taskerId,
      amount_centavos: budget,
      message:
        "Happy to take this on — I've done many condo deep cleans nearby and bring my own supplies.",
      eta_text: "Can start this weekend",
      availability_text: "Weekends and weekday evenings",
      experience_text: "5+ years of professional deep cleaning across Metro Manila.",
      status: "SELECTED",
      created_at: daysAgo(19),
    })
    .select("id")
    .single();
  if (offerErr) throw new Error(`mytaskers offer insert failed: ${offerErr.message}`);

  const { data: booking, error: bookErr } = await admin
    .from("bookings")
    .insert({
      task_id: task.id,
      accepted_offer_id: offer.id,
      client_id: clientId,
      tasker_id: taskerId,
      agreed_centavos: budget,
      status: "COMPLETED",
      idempotency_key: idempotencyKey,
      created_at: daysAgo(18),
    })
    .select("id")
    .single();
  if (bookErr) throw new Error(`mytaskers booking insert failed: ${bookErr.message}`);

  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .insert({ booking_id: booking.id, created_at: daysAgo(18) })
    .select("id")
    .single();
  if (convoErr) throw new Error(`mytaskers conversation insert failed: ${convoErr.message}`);
  const { error: partErr } = await admin.from("conversation_participants").insert([
    { conversation_id: convo.id, user_id: clientId },
    { conversation_id: convo.id, user_id: taskerId },
  ]);
  if (partErr) throw new Error(`mytaskers participants insert failed: ${partErr.message}`);

  const { error: msgErr } = await admin.from("messages").insert([
    {
      conversation_id: convo.id,
      sender_id: clientId,
      body: "Hi Ramon! The unit is on the 12th floor — please buzz 1204 when you arrive.",
      created_at: daysAgo(18),
    },
    {
      conversation_id: convo.id,
      sender_id: taskerId,
      body: "Noted! I'll be there Saturday 9am with all supplies.",
      created_at: daysAgo(18),
    },
    {
      conversation_id: convo.id,
      sender_id: taskerId,
      body: "All done — kitchen and both bathrooms deep cleaned. Thank you!",
      created_at: daysAgo(17),
    },
  ]);
  if (msgErr) throw new Error(`mytaskers messages insert failed: ${msgErr.message}`);

  return { bookingId: booking.id, created: true };
}

async function main() {
  console.log(`Seeding Supabase project at ${SUPABASE_URL}\n`);

  await seedCategories();
  console.log("✓ Categories");

  await repointSampleTasks();
  console.log("✓ Sample tasks re-pointed to live categories");

  await seedSpecialties();
  console.log("✓ Specialties");

  await normalizeSeededLocalityCodes();
  console.log("✓ Locality codes normalized to numeric PSGC");

  await seedPlatformFee();
  console.log("✓ Platform fee setting (explicit 0 bps pending an approved fee model)");

  let clientId = null;
  let taskerId = null;
  for (const account of ACCOUNTS) {
    const { id, created } = await ensureAuthUser(account);
    await ensureProfile(id, account.displayName, account.profile);
    for (const cap of account.capabilities) await ensureCapability(id, cap);
    if (account.verified) await ensureVerificationApproved(id);
    if (account.tasker) await ensureTasker(id, account);
    if (account.email.startsWith("client@")) clientId = id;
    if (account.email.startsWith("tasker@")) taskerId = id;
    console.log(
      `${created ? "+ created" : "= updated"}  ${account.email}  [${account.capabilities.join(", ")}]`,
    );
  }

  if (clientId) {
    try {
      await seedSampleTasks(clientId);
      console.log("✓ Sample tasks");
    } catch (err) {
      console.warn(`! Sample tasks skipped: ${err.message}`);
    }
  }

  if (clientId && taskerId) {
    try {
      await enrichSeedTaskerProfile(taskerId);
      const { bookingId, created } = await seedClientTaskerHistory(clientId, taskerId);
      console.log(
        `✓ My Taskers history (${created ? "created" : "already present"}: completed booking ${bookingId.slice(0, 8)}…)`,
      );
    } catch (err) {
      console.warn(`! My Taskers history skipped: ${err.message}`);
    }
  }

  console.log("\nDone. Accounts and roles are provisioned in Supabase.");
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
