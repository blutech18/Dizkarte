#!/usr/bin/env node
/**
 * Dizkarte — offer-volume test data seeder.
 *
 * Purpose: make the Client-side pages realistic when a task attracts MANY
 * offers. The other seeders give a task one offer from Ramon, which is not
 * enough to exercise the owned-task "Offers" tab, the offer comparison/scroll
 * behaviour, or the feed's "no offers yet" filter.
 *
 * What it creates (all idempotent, all additive — nothing is deleted):
 *
 *   1. A POOL of approved Tasker accounts, generated dynamically:
 *        tasker-01@dev.dizkarte.invalid … tasker-NN@dev.dizkarte.invalid
 *      Same shared development password as every other dev account (read from
 *      packages/config/src/dev/dev-accounts.json, so it can never drift).
 *      Each pool Tasker gets: CLIENT + TASKER capabilities, an APPROVED
 *      verification case, an APPROVED tasker application, a public Tasker
 *      profile with deterministic rating/completion aggregates, 2–4
 *      specialties, and a service area.
 *
 *   2. Extra OPEN tasks for the target Client, so "Your tasks" has volume.
 *
 *   3. Many SUBMITTED offers on each of the target Client's OPEN tasks, with
 *      varied amounts, messages, ETA/availability/experience text, and
 *      staggered timestamps.
 *
 *   4. A few APPROVED task questions from pool Taskers, so the Offers /
 *      Questions tabs both have content.
 *
 *   5. Extra OPEN tasks posted BY pool accounts (they hold CLIENT too), so the
 *      browse/"All tasks" feed is not just three seeded rows. Half of them are
 *      deliberately left with no offers so the "no offers yet" filter is
 *      testable.
 *
 * Rating aggregates are written straight onto `tasker_profiles`
 * (rating_sum/rating_count/completion_count) the same way
 * scripts/seed-supabase.mjs does for Ramon. That is a display-only shortcut:
 * it gives every pool Tasker a believable trust badge without fabricating
 * completed bookings and reviews that would pollute the Client's task lists.
 *
 * SECURITY: needs the SERVICE-ROLE key, same as the other seeders. Provide it
 * via the environment or the git-ignored .env.seed at the repo root. Never run
 * this against a production project: it creates well-known dev credentials.
 *
 * Usage:
 *   node scripts/seed-offers-testdata.mjs
 *   node scripts/seed-offers-testdata.mjs --taskers=16 --offers=12
 *   node scripts/seed-offers-testdata.mjs --client=tasker@dev.dizkarte.invalid
 *   node scripts/seed-offers-testdata.mjs --client-tasks=0 --feed-tasks=0
 *
 * Flags (all optional):
 *   --taskers=N       pool size to provision              (default 14, max 144)
 *   --offers=N        offers per OPEN task                (default 10)
 *   --client=EMAIL    whose OPEN tasks receive the offers (default client@dev…)
 *   --client-tasks=N  extra OPEN tasks for that Client    (default 4)
 *   --feed-tasks=N    extra OPEN tasks from pool accounts (default 8)
 *   --dry-run         report what would change, write nothing
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
loadEnvFile(resolve(repoRoot, "apps", "mobile", ".env.local"));

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  ""
).trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "\nMissing credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the\n" +
      "environment or the git-ignored .env.seed at the repo root, then re-run.\n",
  );
  process.exit(1);
}

const ROSTER = JSON.parse(
  readFileSync(resolve(repoRoot, "packages/config/src/dev/dev-accounts.json"), "utf8"),
);
const PASSWORD = ROSTER.password;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function flag(name, fallback) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const value = hit.slice(name.length + 3);
  return value === "" ? fallback : value;
}
const OPTIONS = {
  taskers: Math.min(144, Math.max(1, Number(flag("taskers", 14)) || 14)),
  offersPerTask: Math.max(0, Number(flag("offers", 10)) || 0),
  clientEmail: String(flag("client", "client@dev.dizkarte.invalid")),
  clientTasks: Math.max(0, Number(flag("client-tasks", 4)) || 0),
  feedTasks: Math.max(0, Number(flag("feed-tasks", 8)) || 0),
  dryRun: process.argv.slice(2).includes("--dry-run"),
};

const log = (m) => console.log("  " + m);
const now = Date.now();
const hoursAgo = (n) => new Date(now - Math.max(0, n) * 3600000).toISOString();
const daysAgo = (n) => new Date(now - Math.max(0, n) * 86400000).toISOString();
const peso = (centavos) => `₱${(centavos / 100).toLocaleString("en-PH")}`;

/** Deterministic 0..1 from an integer seed, so re-runs produce identical data. */
function rand(seed) {
  let x = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return (x >>> 0) / 4294967296;
}
const pickAt = (arr, seed) => arr[Math.floor(rand(seed) * arr.length) % arr.length];
const pad2 = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Pool identity material. Index-based so account N is always the same person.
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  "Jomar",
  "Precious",
  "Arnel",
  "Kristine",
  "Dexter",
  "Marites",
  "Nikko",
  "Cherry",
  "Elmer",
  "Grace",
  "Rodel",
  "Jasmine",
];
const LAST_NAMES = [
  "Villanueva",
  "Dela Cruz",
  "Magsaysay",
  "Alonzo",
  "Pagulayan",
  "Sandoval",
  "Buendia",
  "Robles",
  "Tabujara",
  "Lumibao",
  "Espinosa",
  "Ocampo",
];

const OFFER_MESSAGES = [
  "I can start right away and I bring my own tools, so there is nothing for you to prepare.",
  "Done this exact job many times in your area. Price includes materials and clean-up after.",
  "Available on your preferred schedule. Happy to send photos of similar work I finished last month.",
  "I live nearby so travel time is short. I can drop by first to check the site at no charge.",
  "Fixed price, no surprises. If it takes longer than estimated I will not charge extra.",
  "I work with a partner for the heavy parts, so this can be finished in a single visit.",
  "Included in my quote: materials, disposal of any waste, and a two-week workmanship guarantee.",
  "I can do it this weekend. Message me if you need it sooner and I will try to move things around.",
  "Straightforward job for me. I will confirm the exact measurements before buying anything.",
  "Happy to match a lower quote if you already have one — I would rather keep the work local.",
  "I have the full kit for this, including a vacuum so no dust is left behind.",
  "Been doing this for years around Metro Manila. Punctual, and I send updates while working.",
];
const ETA_TEXTS = [
  "Can start today",
  "Available tomorrow morning",
  "Available this week",
  "Can start this weekend",
  "Free within the next two days",
  "Same-day if booked before noon",
];
const AVAILABILITY_TEXTS = [
  "Weekdays, 8am to 6pm",
  "Weekends and weekday evenings",
  "Any day, flexible hours",
  "Mondays to Saturdays",
  "Weekday afternoons only",
  "Weekends and holidays",
];
const EXPERIENCE_TEXTS = [
  "Over 5 years of hands-on service work in Metro Manila.",
  "3 years full-time, mostly condos and small offices.",
  "Trained under a licensed contractor, 7 years on site.",
  "Around 200 similar jobs completed, all with my own tools.",
  "8 years in the trade, including commercial contracts.",
  "2 years independent, previously with a facilities team.",
];
/** Offer amount as a fraction of the task budget — a real spread to compare. */
const AMOUNT_MULTIPLIERS = [0.68, 0.75, 0.82, 0.88, 0.95, 1, 1.05, 1.12, 1.2, 1.32, 1.45, 0.6];

const QUESTION_TEMPLATES = [
  {
    body: "Is there parking on site, and which floor is the unit on?",
    answer: "Yes, visitor parking is available. The unit is on the 6th floor with elevator access.",
  },
  {
    body: "Do you already have the materials, or should I include them in my quote?",
    answer: "Please include materials in your quote so I can compare the total cost.",
  },
  { body: "What time would you like the work to start?", answer: null },
  { body: "Is the budget negotiable if the job turns out bigger than described?", answer: null },
];

/** Extra OPEN tasks for the target Client. Category slugs must be active. */
const CLIENT_TASK_TEMPLATES = [
  {
    slug: "cleaning",
    title: "Post-renovation deep clean for a 3-bedroom house",
    description:
      "Renovation just finished and there is fine dust everywhere — floors, windows, cabinets and aircon vents. Looking for a thorough top-to-bottom clean, ideally with your own vacuum and supplies.",
    budget: 480000,
    sameDay: false,
    timeOfDay: "morning",
    landmark: "Near Trinoma Mall",
  },
  {
    slug: "furniture-assembly",
    title: "Assemble a study desk, two chairs and a shelf",
    description:
      "Three flat-pack items still in their boxes. All manuals and screws are complete, I just do not have the tools or the patience. Should be a couple of hours of work.",
    budget: 180000,
    sameDay: true,
    timeOfDay: "afternoon",
    landmark: "Near Commonwealth Market",
  },
  {
    slug: "repairs-installations",
    title: "Install a wall-mounted bidet and replace a shower head",
    description:
      "Bidet and shower head are already bought. The existing shower head is stuck and may need a wrench. Water shut-off valve is accessible under the sink.",
    budget: 140000,
    sameDay: false,
    timeOfDay: "midday",
    landmark: "Near SM North EDSA",
  },
  {
    slug: "painting",
    title: "Repaint a small bedroom, walls and ceiling",
    description:
      "Roughly 12 square metres of wall plus the ceiling. Two coats, plain white. Paint will be provided; please bring drop cloths, rollers and masking tape.",
    budget: 350000,
    sameDay: false,
    timeOfDay: "morning",
    landmark: "Near Banawe Street",
  },
  {
    slug: "gardening",
    title: "Trim an overgrown hedge and haul away the cuttings",
    description:
      "About eight metres of hedge that has not been cut in a year, plus a small patch of grass. Cuttings need to be bagged and taken away, not left at the curb.",
    budget: 220000,
    sameDay: false,
    timeOfDay: "afternoon",
    landmark: "Near Quezon Memorial Circle",
  },
  {
    slug: "removals",
    title: "Help move boxes and a fridge to a unit two floors up",
    description:
      "Around fifteen boxes and one two-door fridge. Building has a service elevator but it is small, so the fridge may need the stairs. Two people would be ideal.",
    budget: 300000,
    sameDay: true,
    timeOfDay: "morning",
    landmark: "Near Katipunan Avenue",
  },
  {
    slug: "data-entry",
    title: "Encode 300 receipts into a spreadsheet",
    description:
      "Scanned receipts to be encoded into a Google Sheet: date, vendor, amount, category. Accuracy matters more than speed. Can be done fully online.",
    budget: 250000,
    sameDay: false,
    timeOfDay: null,
    landmark: "Online task",
    online: true,
  },
  {
    slug: "copywriting",
    title: "Write five short product descriptions for an online store",
    description:
      "Five home-appliance listings, around 120 words each, friendly and clear. I will supply the specs and photos. Filipino or English is fine.",
    budget: 200000,
    sameDay: false,
    timeOfDay: null,
    landmark: "Online task",
    online: true,
  },
];

/** OPEN tasks posted by pool accounts, so the browse feed has volume. */
const FEED_TASK_TEMPLATES = [
  {
    slug: "cleaning",
    title: "Weekly condo cleaning for a studio unit",
    description:
      "Looking for someone reliable every Saturday morning. Studio unit, one bathroom, includes dishes, floors and taking out the trash. Long-term if it works out.",
    budget: 90000,
  },
  {
    slug: "repairs-installations",
    title: "Aircon not cooling — needs checking and cleaning",
    description:
      "Split-type unit in the bedroom blows air but does not cool. Needs diagnosis and a general cleaning. Please bring your own pump and cover.",
    budget: 160000,
  },
  {
    slug: "furniture-assembly",
    title: "Mount a 50-inch TV on a concrete wall",
    description:
      "Bracket and screws included with the TV. Wall is concrete so a hammer drill is needed. Cables should be tucked into a raceway which I already bought.",
    budget: 120000,
  },
  {
    slug: "gardening",
    title: "Weed and re-pot plants on a small rooftop",
    description:
      "About twenty pots that need weeding, fresh soil and re-potting. Soil will be delivered in the morning. Shade is limited so early start is better.",
    budget: 190000,
  },
  {
    slug: "removals",
    title: "Deliver a bookshelf across Quezon City",
    description:
      "Flat-packed bookshelf still in its box, roughly 1.8 metres long. Needs a vehicle that can take the length. Pick up and drop off both have parking.",
    budget: 85000,
  },
  {
    slug: "painting",
    title: "Touch up scuffed hallway walls before an inspection",
    description:
      "Several scuff marks and two small nail holes along a hallway. Needs patching, sanding and a matching coat. Paint is already on site.",
    budget: 130000,
  },
  {
    slug: "data-entry",
    title: "Clean up a 2,000-row customer spreadsheet",
    description:
      "Duplicates, inconsistent phone formats and mixed capitalisation. Needs careful de-duplication and normalising to a single format. Fully remote.",
    budget: 300000,
  },
  {
    slug: "copywriting",
    title: "Proofread a 12-page company brochure",
    description:
      "Grammar, spelling and consistency pass on a printed brochure before it goes to press. Tracked changes in a shared document, no design work needed.",
    budget: 150000,
  },
  {
    slug: "cleaning",
    title: "One-time kitchen degreasing for a small carinderia",
    description:
      "Range hood, walls behind the stove and the tiled floor need heavy degreasing. Best done after closing at 8pm. Cleaning chemicals provided.",
    budget: 260000,
  },
  {
    slug: "repairs-installations",
    title: "Replace two broken door knobs and a cabinet hinge",
    description:
      "Both bedroom door knobs stick and one cabinet hinge is snapped. Replacements are bought already, just need someone with the right screwdrivers.",
    budget: 95000,
  },
  {
    slug: "gardening",
    title: "Lay grass on a small front yard",
    description:
      "Roughly 15 square metres. Bermuda grass rolls will be delivered. Ground needs levelling and light soil work before laying.",
    budget: 420000,
  },
  {
    slug: "furniture-assembly",
    title: "Build a two-tier bunk bed",
    description:
      "Bunk bed in three boxes with all fittings. Instructions look long so please allow two to three hours. Room is on the second floor.",
    budget: 210000,
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
async function findUserByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
}

/**
 * Real PSGC localities so the app's city/barangay pickers and the feed's
 * locality names resolve. Falls back to Quezon City if the PSGC tables have
 * not been imported yet.
 */
async function loadLocalities() {
  const fallback = [
    {
      cityCode: "137404",
      barangayCode: "137404022",
      name: "Quezon City",
      lat: 14.656,
      lng: 121.033,
    },
  ];
  const { data: cities } = await admin
    .from("psgc_cities_municipalities")
    .select("code,city6,name")
    .like("region_code", "13%")
    .order("name")
    .limit(12);
  if (!cities || cities.length === 0) return fallback;

  const out = [];
  for (const [i, city] of cities.entries()) {
    const { data: brgy } = await admin
      .from("psgc_barangays")
      .select("code")
      .eq("city_code9", city.code)
      .order("code")
      .limit(1)
      .maybeSingle();
    if (!brgy) continue;
    out.push({
      cityCode: city.city6,
      barangayCode: brgy.code,
      name: city.name,
      // Approximate Metro Manila spread; the exact point stays private anyway.
      lat: 14.52 + rand(1000 + i) * 0.2,
      lng: 120.97 + rand(2000 + i) * 0.15,
    });
  }
  return out.length > 0 ? out : fallback;
}

// ---------------------------------------------------------------------------
// Pool provisioning
// ---------------------------------------------------------------------------
function poolIdentity(index, localities, specialtySlugs) {
  const first = FIRST_NAMES[(index - 1) % FIRST_NAMES.length];
  // The extra wrap term keeps names distinct past the first cycle of 12, so
  // account 13 is not a duplicate of account 1 with the same surname.
  const wrap = Math.floor((index - 1) / FIRST_NAMES.length);
  const last = LAST_NAMES[(index * 5 + wrap * 7) % LAST_NAMES.length];
  const locality = localities[(index - 1) % localities.length];
  const ratingCount = 2 + ((index * 7) % 26); // 2..27
  const ratingTenths = 34 + ((index * 13) % 17); // 3.4..5.0
  const specialtyCount = 2 + (index % 3); // 2..4
  const specialties = Array.from(
    { length: Math.min(specialtyCount, specialtySlugs.length) },
    (_, k) => specialtySlugs[(index * 3 + k) % specialtySlugs.length],
  );
  return {
    index,
    email: `tasker-${pad2(index)}@dev.dizkarte.invalid`,
    displayName: `${first} ${last}`,
    mobile: `+639${String(170000000 + index * 111111).slice(0, 9)}`,
    locality,
    specialties: [...new Set(specialties)],
    ratingCount,
    ratingSum: Math.round((ratingTenths / 10) * ratingCount),
    completionCount: ratingCount + ((index * 3) % 9),
    bio: `${first} here — ${specialties.length > 1 ? "multi-skilled" : "specialist"} Tasker based in ${locality.name}. I bring my own tools, confirm the scope before starting, and keep the site clean.`,
  };
}

async function ensurePoolAccount(identity, specialtyIdBySlug) {
  const existing = await findUserByEmail(identity.email);
  let userId;
  let created = false;
  if (existing) {
    userId = existing.id;
    if (!OPTIONS.dryRun) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: identity.displayName },
      });
      if (error) throw new Error(`updateUser(${identity.email}): ${error.message}`);
    }
  } else {
    if (OPTIONS.dryRun) return { ...identity, userId: null, created: true };
    const { data, error } = await admin.auth.admin.createUser({
      email: identity.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: identity.displayName },
    });
    if (error || !data.user) throw new Error(`createUser(${identity.email}): ${error?.message}`);
    userId = data.user.id;
    created = true;
  }
  if (OPTIONS.dryRun) return { ...identity, userId, created };

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      display_name: identity.displayName,
      mobile: identity.mobile,
      city_code: identity.locality.cityCode,
      barangay_code: identity.locality.barangayCode,
      language: "en",
      bio: identity.bio,
    },
    { onConflict: "id" },
  );
  if (profileError) throw new Error(`profiles upsert: ${profileError.message}`);

  for (const capability of ["CLIENT", "TASKER"]) {
    const { data: held } = await admin
      .from("user_capabilities")
      .select("id")
      .eq("user_id", userId)
      .eq("capability", capability)
      .is("revoked_at", null)
      .maybeSingle();
    if (!held) {
      const { error } = await admin
        .from("user_capabilities")
        .insert({ user_id: userId, capability });
      if (error) throw new Error(`capability ${capability}: ${error.message}`);
    }
  }

  const stamp = new Date().toISOString();
  const { data: verification } = await admin
    .from("verification_cases")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "APPROVED")
    .maybeSingle();
  if (!verification) {
    const { error } = await admin.from("verification_cases").insert({
      user_id: userId,
      status: "APPROVED",
      version: 1,
      submitted_at: stamp,
      decided_at: stamp,
    });
    if (error) throw new Error(`verification_cases: ${error.message}`);
  }

  const { data: application } = await admin
    .from("tasker_applications")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!application) {
    const { error } = await admin.from("tasker_applications").insert({
      user_id: userId,
      status: "APPROVED",
      bio: identity.bio,
      experience: pickAt(EXPERIENCE_TEXTS, identity.index * 31),
      submitted_at: stamp,
      decided_at: stamp,
    });
    if (error) throw new Error(`tasker_applications: ${error.message}`);
  }

  const { error: taskerProfileError } = await admin.from("tasker_profiles").upsert(
    {
      user_id: userId,
      public_bio: identity.bio,
      public_experience: pickAt(EXPERIENCE_TEXTS, identity.index * 17),
      completion_count: identity.completionCount,
      rating_sum: identity.ratingSum,
      rating_count: identity.ratingCount,
      approved_at: stamp,
    },
    { onConflict: "user_id" },
  );
  if (taskerProfileError) throw new Error(`tasker_profiles: ${taskerProfileError.message}`);

  const specialtyRows = identity.specialties
    .map((slug) => specialtyIdBySlug.get(slug))
    .filter(Boolean)
    .map((specialty_id) => ({ user_id: userId, specialty_id }));
  if (specialtyRows.length > 0) {
    const { error } = await admin
      .from("tasker_specialties")
      .upsert(specialtyRows, { onConflict: "user_id,specialty_id" });
    if (error) throw new Error(`tasker_specialties: ${error.message}`);
  }

  const { data: area } = await admin
    .from("service_areas")
    .select("id")
    .eq("user_id", userId)
    .eq("city_code", identity.locality.cityCode)
    .maybeSingle();
  if (!area) {
    const { error } = await admin.from("service_areas").insert({
      user_id: userId,
      city_code: identity.locality.cityCode,
      barangay_code: identity.locality.barangayCode,
      radius_km: 10 + (identity.index % 4) * 5,
    });
    if (error) throw new Error(`service_areas: ${error.message}`);
  }

  return { ...identity, userId, created };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
/** Insert an OPEN task plus its public/private location pair. Keyed on title. */
async function ensureOpenTask(clientId, template, categoryIdBySlug, locality, seed) {
  const categoryId = categoryIdBySlug.get(template.slug);
  if (!categoryId) return { id: null, created: false };

  const { data: existing } = await admin
    .from("tasks")
    .select("id")
    .eq("client_id", clientId)
    .eq("title", template.title)
    .maybeSingle();
  if (existing) return { id: existing.id, created: false };
  if (OPTIONS.dryRun) return { id: null, created: true };

  const ageDays = 1 + (seed % 9);
  const online = template.online === true;
  const { data: task, error } = await admin
    .from("tasks")
    .insert({
      client_id: clientId,
      category_id: categoryId,
      title: template.title,
      description: template.description,
      budget_centavos: template.budget,
      same_day: template.sameDay === true,
      time_of_day: template.timeOfDay ?? null,
      location_type: online ? "online" : "in_person",
      scheduled_for: template.sameDay ? null : daysAgo(-1 * (2 + (seed % 6))),
      status: "OPEN",
      published_at: daysAgo(ageDays),
      created_at: daysAgo(ageDays + 1),
    })
    .select("id")
    .single();
  if (error) throw new Error(`task insert (${template.title}): ${error.message}`);

  const point = `SRID=4326;POINT(${locality.lng.toFixed(4)} ${locality.lat.toFixed(4)})`;
  const { error: pubError } = await admin.from("task_public_locations").insert({
    task_id: task.id,
    city_code: locality.cityCode,
    barangay_code: locality.barangayCode,
    landmark: template.landmark ?? `Near ${locality.name}`,
    approximate_point: point,
  });
  if (pubError) throw new Error(`public location: ${pubError.message}`);
  const { error: privError } = await admin.from("task_private_locations").insert({
    task_id: task.id,
    exact_address: `${10 + (seed % 80)} Sampaguita Street, ${locality.name} (offer-volume seed)`,
    exact_point: point,
  });
  if (privError) throw new Error(`private location: ${privError.message}`);

  return { id: task.id, created: true };
}

// ---------------------------------------------------------------------------
// Offers + questions
// ---------------------------------------------------------------------------
async function seedOffersForTask(task, pool, taskSeed) {
  if (OPTIONS.offersPerTask === 0) return 0;
  // Rotate the pool per task so tasks do not all show the same faces in the
  // same order, and so the cheapest offer is not always from the same Tasker.
  const offset = taskSeed % Math.max(1, pool.length);
  const chosen = Array.from(
    { length: Math.min(OPTIONS.offersPerTask, pool.length) },
    (_, k) => pool[(offset + k) % pool.length],
  ).filter((tasker) => tasker.userId && tasker.userId !== task.client_id);

  const rows = chosen.map((tasker, k) => {
    const seed = taskSeed * 97 + tasker.index * 13 + k;
    const multiplier = AMOUNT_MULTIPLIERS[(tasker.index + taskSeed) % AMOUNT_MULTIPLIERS.length];
    const amount = Math.min(
      100000000,
      Math.max(2000, Math.round((task.budget_centavos * multiplier) / 100) * 100),
    );
    return {
      task_id: task.id,
      tasker_id: tasker.userId,
      amount_centavos: amount,
      message: pickAt(OFFER_MESSAGES, seed),
      eta_text: pickAt(ETA_TEXTS, seed + 1),
      availability_text: pickAt(AVAILABILITY_TEXTS, seed + 2),
      experience_text: pickAt(EXPERIENCE_TEXTS, seed + 3),
      status: "SUBMITTED",
      created_at: hoursAgo(2 + k * 5 + (seed % 7)),
    };
  });
  if (rows.length === 0 || OPTIONS.dryRun) return rows.length;

  // uq_offer_task_tasker (task_id, tasker_id) makes this safely re-runnable.
  const { error } = await admin
    .from("offers")
    .upsert(rows, { onConflict: "task_id,tasker_id", ignoreDuplicates: true });
  if (error) throw new Error(`offers upsert: ${error.message}`);
  return rows.length;
}

async function seedQuestionsForTask(task, pool, taskSeed) {
  const { count } = await admin
    .from("task_questions")
    .select("*", { count: "exact", head: true })
    .eq("task_id", task.id);
  if ((count ?? 0) > 0) return 0;

  const askers = pool.filter((t) => t.userId && t.userId !== task.client_id);
  if (askers.length === 0) return 0;
  const howMany = 1 + (taskSeed % 3);
  const rows = Array.from({ length: howMany }, (_, k) => {
    const template = QUESTION_TEMPLATES[(taskSeed + k) % QUESTION_TEMPLATES.length];
    return {
      task_id: task.id,
      author_id: askers[(taskSeed + k) % askers.length].userId,
      body: template.body,
      status: "APPROVED",
      ...(template.answer ? { answer: template.answer, answered_at: hoursAgo(1 + k) } : {}),
      created_at: hoursAgo(6 + k * 3),
    };
  });
  if (OPTIONS.dryRun) return rows.length;
  const { error } = await admin.from("task_questions").insert(rows);
  if (error) throw new Error(`task_questions insert: ${error.message}`);
  return rows.length;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding offer-volume test data on ${SUPABASE_URL}`);
  console.log(
    `Pool: ${OPTIONS.taskers} Taskers · ${OPTIONS.offersPerTask} offers per OPEN task · ` +
      `client: ${OPTIONS.clientEmail}` +
      (OPTIONS.dryRun ? "  [DRY RUN]" : "") +
      "\n",
  );

  const client = await findUserByEmail(OPTIONS.clientEmail);
  if (!client)
    throw new Error(`client ${OPTIONS.clientEmail} not found — run npm run seed:supabase`);

  const [{ data: categories }, { data: specialties }, localities] = await Promise.all([
    admin.from("categories").select("id,slug").eq("active", true),
    admin.from("specialties").select("id,slug").eq("active", true).order("sort_order"),
    loadLocalities(),
  ]);
  const categoryIdBySlug = new Map((categories ?? []).map((c) => [c.slug, c.id]));
  const specialtyIdBySlug = new Map((specialties ?? []).map((s) => [s.slug, s.id]));
  const specialtySlugs = (specialties ?? []).map((s) => s.slug);
  if (specialtySlugs.length === 0) throw new Error("no specialties — run npm run seed:supabase");
  log(
    `${categoryIdBySlug.size} active categories · ${specialtySlugs.length} specialties · ${localities.length} localities`,
  );

  // 1. Pool accounts.
  console.log("\nA. Tasker pool");
  const pool = [];
  let createdAccounts = 0;
  for (let i = 1; i <= OPTIONS.taskers; i += 1) {
    const identity = poolIdentity(i, localities, specialtySlugs);
    const account = await ensurePoolAccount(identity, specialtyIdBySlug);
    pool.push(account);
    if (account.created) createdAccounts += 1;
    log(
      `${account.created ? "+" : "="} ${account.email.padEnd(36)} ${account.displayName.padEnd(22)} ` +
        `${(account.ratingSum / account.ratingCount).toFixed(1)}★ (${account.ratingCount}) · ${account.completionCount} jobs`,
    );
  }

  // 2. Extra OPEN tasks for the target client.
  console.log("\nB. Client OPEN tasks");
  let createdClientTasks = 0;
  for (let i = 0; i < Math.min(OPTIONS.clientTasks, CLIENT_TASK_TEMPLATES.length); i += 1) {
    const template = CLIENT_TASK_TEMPLATES[i];
    const locality = localities[i % localities.length];
    const { id, created } = await ensureOpenTask(
      client.id,
      template,
      categoryIdBySlug,
      locality,
      i + 1,
    );
    if (created) createdClientTasks += 1;
    const note = id || OPTIONS.dryRun ? "" : " (skipped — category inactive)";
    log(`${created ? "+" : "="} ${template.title} — ${peso(template.budget)}${note}`);
  }

  // 3. Offers + questions on every OPEN task the client owns.
  console.log("\nC. Offers on the client's OPEN tasks");
  const { data: openTasks, error: openError } = await admin
    .from("tasks")
    .select("id,title,budget_centavos,client_id")
    .eq("client_id", client.id)
    .eq("status", "OPEN")
    .order("published_at", { ascending: false });
  if (openError) throw new Error(`open task read: ${openError.message}`);

  let offerCount = 0;
  let questionCount = 0;
  for (const [i, task] of (openTasks ?? []).entries()) {
    const written = await seedOffersForTask(task, pool, i + 1);
    const asked = await seedQuestionsForTask(task, pool, i + 1);
    offerCount += written;
    questionCount += asked;
    const { count: live } = await admin
      .from("offers")
      .select("*", { count: "exact", head: true })
      .eq("task_id", task.id);
    log(`${task.title.slice(0, 52).padEnd(54)} ${live ?? 0} offers · +${asked} questions`);
  }
  if ((openTasks ?? []).length === 0) log("no OPEN tasks for this client — nothing to offer on");

  // 4. Feed volume from pool accounts acting as clients.
  console.log("\nD. Feed tasks from pool accounts");
  let createdFeedTasks = 0;
  for (let i = 0; i < Math.min(OPTIONS.feedTasks, FEED_TASK_TEMPLATES.length); i += 1) {
    const template = FEED_TASK_TEMPLATES[i];
    const poster = pool[i % pool.length];
    if (!poster.userId) continue;
    const locality = localities[(i + 3) % localities.length];
    const { id, created } = await ensureOpenTask(
      poster.userId,
      template,
      categoryIdBySlug,
      locality,
      i + 20,
    );
    if (created) createdFeedTasks += 1;
    // Give every other feed task a couple of offers, leaving the rest empty so
    // the feed's "no offers yet" filter has both sides to show.
    if (id && i % 2 === 0) {
      await seedOffersForTask(
        { id, client_id: poster.userId, budget_centavos: template.budget },
        pool.slice(0, 3),
        i + 40,
      );
    }
    log(
      `${created ? "+" : "="} ${template.title.slice(0, 48).padEnd(50)} by ${poster.displayName}`,
    );
  }

  console.log(
    `\nDone.${OPTIONS.dryRun ? " (dry run — nothing written)" : ""}\n` +
      `  pool accounts created: ${createdAccounts} (total ${pool.length})\n` +
      `  client OPEN tasks created: ${createdClientTasks}\n` +
      `  offers written/ensured: ${offerCount}\n` +
      `  questions added: ${questionCount}\n` +
      `  feed tasks created: ${createdFeedTasks}\n` +
      `\nSign in as any pool Tasker with the shared dev password: ${PASSWORD}\n` +
      `  tasker-01@dev.dizkarte.invalid … tasker-${pad2(pool.length)}@dev.dizkarte.invalid\n`,
  );
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
