#!/usr/bin/env node
/**
 * Seed a fully-populated CLIENT test account (client@dev.dizkarte.invalid /
 * Maria Santos) across every client-touchable table, so each client-side page
 * has realistic data. Idempotent: re-running upserts singletons and skips
 * already-created lifecycle rows.
 *
 * Uses direct service-role inserts with explicit statuses (the same approach as
 * scripts/seed-supabase.mjs). Ramon (tasker@dev) is the counterparty tasker on
 * the in-flight lifecycle bookings; section B2 provisions two further approved
 * Taskers with finished jobs, which is what populates the home screen's
 * "My Taskers" row (derived from real bookings, not a favourites table).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(resolve(repoRoot, ".env.seed"));
loadEnv(resolve(repoRoot, "apps", "mobile", ".env.local"));
const URL = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

// Read from the canonical roster so the shared development password can never
// drift from what the apps' sign-in screens display.
const DEV_PASSWORD = JSON.parse(
  readFileSync(resolve(repoRoot, "packages/config/src/dev/dev-accounts.json"), "utf8"),
).password;

const QC = { city: "137404", brgy: "137404022" }; // Quezon City / Commonwealth
const POINT = "SRID=4326;POINT(121.0327 14.6560)";
const now = Date.now();
const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
let created = 0;
const log = (m) => console.log("  " + m);

async function userId(email) {
  const { data: u } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return u.users.find((x) => x.email === email)?.id ?? null;
}

async function main() {
  const maria = await userId("client@dev.dizkarte.invalid");
  const ramon = await userId("tasker@dev.dizkarte.invalid");
  if (!maria || !ramon) throw new Error("dev accounts not found");
  console.log(
    `Seeding client test data for Maria (${maria.slice(0, 8)}), tasker Ramon (${ramon.slice(0, 8)})\n`,
  );

  const { data: cats } = await admin.from("categories").select("id,slug").eq("active", true);
  const cat = (slug) => cats.find((c) => c.slug === slug)?.id ?? cats[0].id;

  // --- A. Profile-level singletons (upsert) ---
  console.log("A. Profile singletons");
  await admin
    .from("billing_addresses")
    .upsert(
      {
        user_id: maria,
        line1: "24 Katipunan Avenue",
        line2: "Unit 12B",
        city: "Quezon City",
        region: "NCR",
        postal_code: "1108",
        country: "PH",
      },
      { onConflict: "user_id" },
    );
  log("billing_addresses ✓");

  await admin
    .from("devices")
    .upsert(
      {
        user_id: maria,
        platform: "ios",
        token_reference: "seed-ExponentPushToken-maria-ios",
        enabled: true,
      },
      { onConflict: "user_id,token_reference" },
    );
  log("devices ✓");

  const prefCats = [
    "verification",
    "offers",
    "bookings",
    "payments",
    "messages",
    "disputes",
    "reviews",
    "system",
    "nearby",
    "promotions",
    "safety",
  ];
  await admin.from("notification_preferences").upsert(
    prefCats.map((category) => ({
      user_id: maria,
      category,
      in_app: true,
      push: category !== "promotions",
    })),
    { onConflict: "user_id,category" },
  );
  log(`notification_preferences ✓ (${prefCats.length})`);

  await admin
    .from("payout_methods")
    .upsert(
      {
        user_id: maria,
        provider: "PH_GCASH",
        provider_reference: "tok_seed_maria_gcash",
        masked_label: "GCash ••••2872",
        status: "active",
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .then(() => {})
    .catch(() => {});
  const { count: pmCount } = await admin
    .from("payout_methods")
    .select("*", { count: "exact", head: true })
    .eq("user_id", maria);
  if ((pmCount ?? 0) === 0) {
    await admin
      .from("payout_methods")
      .insert({
        user_id: maria,
        provider: "PH_GCASH",
        provider_reference: "tok_seed_maria_gcash",
        masked_label: "GCash ••••2872",
        status: "active",
      });
  }
  log("payout_methods ✓");

  // Verification documents on Maria's approved case.
  const { data: vcase } = await admin
    .from("verification_cases")
    .select("id")
    .eq("user_id", maria)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (vcase) {
    const { count: vdCount } = await admin
      .from("verification_documents")
      .select("*", { count: "exact", head: true })
      .eq("case_id", vcase.id);
    if ((vdCount ?? 0) === 0) {
      await admin.from("verification_documents").insert([
        {
          case_id: vcase.id,
          kind: "government_id_front",
          storage_path: `${maria}/${vcase.id}/id-front.jpg`,
          mime_type: "image/jpeg",
          size_bytes: 482113,
        },
        {
          case_id: vcase.id,
          kind: "government_id_back",
          storage_path: `${maria}/${vcase.id}/id-back.jpg`,
          mime_type: "image/jpeg",
          size_bytes: 471044,
        },
        {
          case_id: vcase.id,
          kind: "selfie",
          storage_path: `${maria}/${vcase.id}/selfie.jpg`,
          mime_type: "image/jpeg",
          size_bytes: 512900,
        },
      ]);
      log("verification_documents ✓ (3)");
    } else log("verification_documents already present");
  }

  // --- B. Lifecycle bookings in the states Maria was missing ---
  console.log("B. Lifecycle bookings");
  const lifecycle = [
    {
      key: "seed-maria-pending",
      title: "Assemble a flat-pack wardrobe",
      categorySlug: "furniture-assembly",
      budget: 120000,
      taskStatus: "BOOKING_PENDING",
      bookingStatus: "PAYMENT_PENDING",
      intent: "CREATED",
      chat: false,
      ageDays: 2,
    },
    {
      key: "seed-maria-confirmed",
      title: "Weekly condo cleaning",
      categorySlug: "cleaning",
      budget: 90000,
      taskStatus: "ASSIGNED",
      bookingStatus: "CONFIRMED",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 4,
    },
    {
      key: "seed-maria-inprogress",
      title: "Repaint living room wall",
      categorySlug: "painting",
      budget: 300000,
      taskStatus: "IN_PROGRESS",
      bookingStatus: "IN_PROGRESS",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 6,
    },
    {
      key: "seed-maria-completionreq",
      title: "Fix leaking kitchen tap",
      categorySlug: "repairs-installations",
      budget: 85000,
      taskStatus: "COMPLETION_REQUESTED",
      bookingStatus: "COMPLETION_REQUESTED",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 8,
    },
    {
      key: "seed-maria-disputed",
      title: "Garden landscaping and cleanup",
      categorySlug: "gardening",
      budget: 450000,
      taskStatus: "DISPUTED",
      bookingStatus: "DISPUTED",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 12,
      dispute: true,
    },
  ];

  for (const b of lifecycle) {
    const { data: existing } = await admin
      .from("bookings")
      .select("id")
      .eq("idempotency_key", b.key)
      .maybeSingle();
    if (existing) {
      log(`${b.bookingStatus} already exists`);
      continue;
    }
    const { data: task } = await admin
      .from("tasks")
      .insert({
        client_id: maria,
        category_id: cat(b.categorySlug),
        title: b.title,
        description: `${b.title}. Seeded ${b.bookingStatus} booking so the client's tasks and bookings lists show this state.`,
        budget_centavos: b.budget,
        same_day: false,
        status: b.taskStatus,
        published_at: daysAgo(b.ageDays + 1),
        created_at: daysAgo(b.ageDays + 2),
      })
      .select("id")
      .single();
    await admin
      .from("task_public_locations")
      .insert({
        task_id: task.id,
        city_code: QC.city,
        barangay_code: QC.brgy,
        landmark: "Near Commonwealth Market",
        approximate_point: POINT,
      });
    await admin
      .from("task_private_locations")
      .insert({
        task_id: task.id,
        exact_address: "24 Katipunan Avenue, Quezon City (seed)",
        exact_point: POINT,
      });
    const { data: offer } = await admin
      .from("offers")
      .insert({
        task_id: task.id,
        tasker_id: ramon,
        amount_centavos: b.budget,
        message: "I can take this on and bring my own tools and supplies.",
        eta_text: "Available this week",
        availability_text: "Weekdays and weekends",
        experience_text: "Years of experience with jobs like this.",
        status: "SELECTED",
        created_at: daysAgo(b.ageDays),
      })
      .select("id")
      .single();
    const { data: booking } = await admin
      .from("bookings")
      .insert({
        task_id: task.id,
        accepted_offer_id: offer.id,
        client_id: maria,
        tasker_id: ramon,
        agreed_centavos: b.budget,
        status: b.bookingStatus,
        idempotency_key: b.key,
        created_at: daysAgo(b.ageDays - 1 < 0 ? 0 : b.ageDays - 1),
      })
      .select("id")
      .single();
    await admin
      .from("payment_intents")
      .insert({
        booking_id: booking.id,
        provider: b.intent === "CREATED" ? "pending-selection" : "xendit",
        amount_centavos: b.budget,
        status: b.intent,
        idempotency_key: `pi_${b.key}`,
      });
    // Booking event timeline.
    const evts = [{ from: null, to: "PAYMENT_PENDING" }];
    if (b.bookingStatus !== "PAYMENT_PENDING")
      evts.push({ from: "PAYMENT_PENDING", to: "CONFIRMED" });
    if (["IN_PROGRESS", "COMPLETION_REQUESTED", "DISPUTED"].includes(b.bookingStatus))
      evts.push({ from: "CONFIRMED", to: "IN_PROGRESS" });
    if (b.bookingStatus === "COMPLETION_REQUESTED")
      evts.push({ from: "IN_PROGRESS", to: "COMPLETION_REQUESTED" });
    if (b.bookingStatus === "DISPUTED") evts.push({ from: "IN_PROGRESS", to: "DISPUTED" });
    await admin.from("booking_events").insert(
      evts.map((e, i) => ({
        booking_id: booking.id,
        from_status: e.from,
        to_status: e.to,
        actor_id: maria,
        source: "client",
        idempotency_key: `${b.key}-evt-${i}`,
      })),
    );
    // Chat (only once payment confirmed).
    if (b.chat) {
      const { data: convo } = await admin
        .from("conversations")
        .insert({ booking_id: booking.id, created_at: daysAgo(b.ageDays - 1) })
        .select("id")
        .single();
      await admin.from("conversation_participants").insert([
        { conversation_id: convo.id, user_id: maria },
        { conversation_id: convo.id, user_id: ramon },
      ]);
      await admin.from("messages").insert([
        {
          conversation_id: convo.id,
          sender_id: maria,
          body: "Hi! Looking forward to this — let me know if you need anything.",
          created_at: daysAgo(b.ageDays - 1),
        },
        {
          conversation_id: convo.id,
          sender_id: ramon,
          body: "Thanks! I'll be there as scheduled and bring everything needed.",
          created_at: daysAgo(b.ageDays - 1),
        },
      ]);
    }
    // Dispute + evidence.
    if (b.dispute) {
      const { data: dsp } = await admin
        .from("disputes")
        .insert({
          booking_id: booking.id,
          opened_by: maria,
          status: "OPEN",
          reason:
            "The work was left unfinished and part of the garden was not cleaned up as agreed.",
        })
        .select("id")
        .single();
      await admin
        .from("evidence")
        .insert({
          owner_id: maria,
          resource_type: "dispute",
          resource_id: dsp.id,
          storage_path: `${maria}/disputes/${dsp.id}/photo1.jpg`,
        });
    }
    created++;
    log(`${b.bookingStatus} ✓`);
  }

  // --- B2. Additional trusted Taskers, so "My Taskers" has more than one ---
  //
  // "My Taskers" is not a stored favourites list: the home screen derives it
  // from real bookings where Maria is the Client and the booking reached
  // CONFIRMED or later, one card per Tasker. So adding a face to that row means
  // provisioning a genuine approved Tasker and giving them a real finished job
  // with Maria — there is nothing to fake.
  //
  // The rating/completion aggregates are written straight onto `tasker_profiles`,
  // the same display-only shortcut scripts/seed-supabase.mjs uses for Ramon.
  // Note that `app.recount_review_aggregate` (migration 0042) recomputes those
  // two columns from REVEALED reviews whenever a real reveal path runs, so these
  // seeded numbers are a starting display value, not a permanent one.
  console.log("B2. Additional trusted Taskers");
  const { data: specialtyRows } = await admin
    .from("specialties")
    .select("id,slug")
    .eq("active", true)
    .order("sort_order");
  const allSpecialties = specialtyRows ?? [];

  const trusted = [
    {
      email: "tasker-grace@dev.dizkarte.invalid",
      displayName: "Grace Lumibao",
      mobile: "+639181234567",
      brgy: "137404014",
      bio: "Deep-cleaning specialist working across Quezon City. I bring my own supplies, confirm the scope before starting, and always leave the place spotless.",
      experience: "Six years of condo and small-office cleaning, mostly repeat clients.",
      specialtyOffset: 0,
      specialtyCount: 3,
      ratingCount: 18,
      ratingTenths: 49,
      completionCount: 21,
      radiusKm: 12,
      job: {
        key: "seed-maria-completed-grace",
        title: "Post-renovation deep clean",
        categorySlug: "cleaning",
        budget: 180000,
        ageDays: 21,
        offerMessage:
          "I handle post-renovation dust properly — including the vents and window tracks. Supplies included.",
        clientMessage: "The unit is ready whenever you are. Thanks for squeezing us in!",
        taskerMessage: "All done — I left the windows and vents cleared too. Enjoy the clean unit!",
      },
    },
    {
      email: "tasker-dexter@dev.dizkarte.invalid",
      displayName: "Dexter Alonzo",
      mobile: "+639182345678",
      brgy: "137404031",
      bio: "Licensed aircon and electrical Tasker serving Metro Manila. I diagnose before quoting, and I do not start work you have not approved.",
      experience: "Nine years servicing split-type and window units, plus small electrical repairs.",
      specialtyOffset: 3,
      specialtyCount: 2,
      ratingCount: 11,
      ratingTenths: 47,
      completionCount: 14,
      radiusKm: 18,
      job: {
        key: "seed-maria-completed-dexter",
        title: "Aircon cleaning and freon top-up",
        categorySlug: "repairs-installations",
        budget: 145000,
        ageDays: 34,
        offerMessage:
          "I can service both units in one visit and check the drainage line while I am there.",
        clientMessage: "One unit has been dripping — please take a look at that one first.",
        taskerMessage: "Fixed the drain line and topped up the freon. Both units are cooling well.",
      },
    },
  ];

  for (const t of trusted) {
    // 1. The account itself, approved end to end so the public profile resolves.
    let taskerId = await userId(t.email);
    if (taskerId) {
      await admin.auth.admin.updateUserById(taskerId, {
        password: DEV_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: t.displayName },
      });
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: t.email,
        password: DEV_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: t.displayName },
      });
      if (error || !data.user) throw new Error(`createUser(${t.email}): ${error?.message}`);
      taskerId = data.user.id;
    }

    await admin.from("profiles").upsert(
      {
        id: taskerId,
        display_name: t.displayName,
        mobile: t.mobile,
        city_code: QC.city,
        barangay_code: t.brgy,
        language: "en",
        bio: t.bio,
      },
      { onConflict: "id" },
    );

    for (const capability of ["CLIENT", "TASKER"]) {
      const { data: held } = await admin
        .from("user_capabilities")
        .select("id")
        .eq("user_id", taskerId)
        .eq("capability", capability)
        .is("revoked_at", null)
        .maybeSingle();
      if (!held) {
        await admin.from("user_capabilities").insert({ user_id: taskerId, capability });
      }
    }

    const stamp = new Date().toISOString();
    const { data: verified } = await admin
      .from("verification_cases")
      .select("id")
      .eq("user_id", taskerId)
      .eq("status", "APPROVED")
      .maybeSingle();
    if (!verified) {
      await admin.from("verification_cases").insert({
        user_id: taskerId,
        status: "APPROVED",
        version: 1,
        submitted_at: stamp,
        decided_at: stamp,
      });
    }

    const { data: application } = await admin
      .from("tasker_applications")
      .select("id")
      .eq("user_id", taskerId)
      .maybeSingle();
    if (!application) {
      await admin.from("tasker_applications").insert({
        user_id: taskerId,
        status: "APPROVED",
        bio: t.bio,
        experience: t.experience,
        submitted_at: stamp,
        decided_at: stamp,
      });
    }

    // `approved_at` set and `suspended_at` null is what makes the public profile
    // read as approved, which the My Taskers card relies on.
    await admin.from("tasker_profiles").upsert(
      {
        user_id: taskerId,
        public_bio: t.bio,
        public_experience: t.experience,
        completion_count: t.completionCount,
        rating_sum: Math.round((t.ratingTenths / 10) * t.ratingCount),
        rating_count: t.ratingCount,
        approved_at: stamp,
      },
      { onConflict: "user_id" },
    );

    // Specialties are chosen from whatever the schema actually has, so the seed
    // cannot break on a slug that was renamed or removed.
    const chosen = Array.from({ length: t.specialtyCount }, (_, k) =>
      allSpecialties.length > 0
        ? allSpecialties[(t.specialtyOffset + k) % allSpecialties.length]
        : null,
    ).filter(Boolean);
    if (chosen.length > 0) {
      await admin.from("tasker_specialties").upsert(
        chosen.map((s) => ({ user_id: taskerId, specialty_id: s.id })),
        { onConflict: "user_id,specialty_id" },
      );
    }

    const { data: area } = await admin
      .from("service_areas")
      .select("id")
      .eq("user_id", taskerId)
      .eq("city_code", QC.city)
      .maybeSingle();
    if (!area) {
      await admin.from("service_areas").insert({
        user_id: taskerId,
        city_code: QC.city,
        barangay_code: t.brgy,
        radius_km: t.radiusKm,
      });
    }

    // 2. A finished job with Maria. This is what actually puts the Tasker in
    //    her "My Taskers" row; the profile above only decides how the card reads.
    const j = t.job;
    const { data: existing } = await admin
      .from("bookings")
      .select("id")
      .eq("idempotency_key", j.key)
      .maybeSingle();
    if (existing) {
      log(`${t.displayName} already has a completed booking`);
      continue;
    }

    const { data: task } = await admin
      .from("tasks")
      .insert({
        client_id: maria,
        category_id: cat(j.categorySlug),
        title: j.title,
        description: `${j.title}. Seeded COMPLETED booking so ${t.displayName} appears in Maria's My Taskers row and can be rebooked.`,
        budget_centavos: j.budget,
        same_day: false,
        status: "COMPLETED",
        published_at: daysAgo(j.ageDays + 2),
        created_at: daysAgo(j.ageDays + 3),
      })
      .select("id")
      .single();
    await admin.from("task_public_locations").insert({
      task_id: task.id,
      city_code: QC.city,
      barangay_code: t.brgy,
      landmark: "Near Commonwealth Market",
      approximate_point: POINT,
    });
    await admin.from("task_private_locations").insert({
      task_id: task.id,
      exact_address: "24 Katipunan Avenue, Quezon City (seed)",
      exact_point: POINT,
    });
    const { data: offer } = await admin
      .from("offers")
      .insert({
        task_id: task.id,
        tasker_id: taskerId,
        amount_centavos: j.budget,
        message: j.offerMessage,
        eta_text: "Available this week",
        availability_text: "Weekdays and weekends",
        experience_text: t.experience,
        status: "SELECTED",
        created_at: daysAgo(j.ageDays + 1),
      })
      .select("id")
      .single();
    const { data: booking } = await admin
      .from("bookings")
      .insert({
        task_id: task.id,
        accepted_offer_id: offer.id,
        client_id: maria,
        tasker_id: taskerId,
        agreed_centavos: j.budget,
        status: "COMPLETED",
        idempotency_key: j.key,
        created_at: daysAgo(j.ageDays),
      })
      .select("id")
      .single();
    // Funds released: the job finished, so the money is no longer held.
    await admin.from("payment_intents").insert({
      booking_id: booking.id,
      provider: "xendit",
      amount_centavos: j.budget,
      status: "RELEASED",
      idempotency_key: `pi_${j.key}`,
    });
    const chain = [
      { from: null, to: "PAYMENT_PENDING" },
      { from: "PAYMENT_PENDING", to: "CONFIRMED" },
      { from: "CONFIRMED", to: "IN_PROGRESS" },
      { from: "IN_PROGRESS", to: "COMPLETION_REQUESTED" },
      { from: "COMPLETION_REQUESTED", to: "COMPLETED" },
    ];
    await admin.from("booking_events").insert(
      chain.map((e, i) => ({
        booking_id: booking.id,
        from_status: e.from,
        to_status: e.to,
        actor_id: maria,
        source: "client",
        idempotency_key: `${j.key}-evt-${i}`,
      })),
    );
    const { data: convo } = await admin
      .from("conversations")
      .insert({ booking_id: booking.id, created_at: daysAgo(j.ageDays) })
      .select("id")
      .single();
    await admin.from("conversation_participants").insert([
      { conversation_id: convo.id, user_id: maria },
      { conversation_id: convo.id, user_id: taskerId },
    ]);
    await admin.from("messages").insert([
      {
        conversation_id: convo.id,
        sender_id: maria,
        body: j.clientMessage,
        created_at: daysAgo(j.ageDays),
      },
      {
        conversation_id: convo.id,
        sender_id: taskerId,
        body: j.taskerMessage,
        created_at: daysAgo(j.ageDays - 1 < 0 ? 0 : j.ageDays - 1),
      },
    ]);
    created++;
    log(`${t.displayName} — approved Tasker + COMPLETED booking ✓`);
  }

  // --- C. Reviews on existing COMPLETED bookings ---
  console.log("C. Reviews");
  const { data: completed } = await admin
    .from("bookings")
    .select("id,tasker_id")
    .eq("client_id", maria)
    .eq("status", "COMPLETED");
  for (const bk of completed ?? []) {
    await seedReview(
      bk.id,
      maria,
      bk.tasker_id,
      5,
      "Fantastic work — punctual, tidy, and very professional. Would book again!",
      [
        { dimension: "communication", score: 5 },
        { dimension: "quality", score: 5 },
        { dimension: "timeliness", score: 4 },
        { dimension: "professionalism", score: 5 },
      ],
    );
    await seedReview(
      bk.id,
      bk.tasker_id,
      maria,
      5,
      "Great client — clear instructions and easy to coordinate with. Thank you!",
      [
        { dimension: "communication", score: 5 },
        { dimension: "professionalism", score: 5 },
      ],
    );
  }
  log(`reviews for ${(completed ?? []).length} completed booking(s) ✓`);

  // --- D. Questions on Maria's OPEN task ---
  console.log("D. Task questions");
  const { data: openTask } = await admin
    .from("tasks")
    .select("id")
    .eq("client_id", maria)
    .eq("status", "OPEN")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openTask) {
    const { count: qCount } = await admin
      .from("task_questions")
      .select("*", { count: "exact", head: true })
      .eq("task_id", openTask.id);
    if ((qCount ?? 0) === 0) {
      await admin.from("task_questions").insert([
        {
          task_id: openTask.id,
          author_id: ramon,
          body: "Is parking available on site, and roughly how many items are involved?",
          status: "APPROVED",
          answer: "Yes, there's visitor parking. About 8 medium boxes and one small cabinet.",
          answered_at: daysAgo(1),
        },
        {
          task_id: openTask.id,
          author_id: ramon,
          body: "What's the preferred start time?",
          status: "APPROVED",
        },
      ]);
      log("task_questions ✓ (2)");
    } else log("task_questions already present");
  }

  // --- E. Support tickets + messages ---
  console.log("E. Support tickets");
  const { count: stCount } = await admin
    .from("support_tickets")
    .select("*", { count: "exact", head: true })
    .eq("user_id", maria);
  if ((stCount ?? 0) === 0) {
    const { data: t1 } = await admin
      .from("support_tickets")
      .insert({
        user_id: maria,
        subject: "Payment shows pending",
        narrative: "My payment for a booking still shows as pending after an hour. Can you check?",
        category: "payment",
        status: "OPEN",
      })
      .select("id")
      .single();
    await admin.from("ticket_messages").insert([
      {
        ticket_id: t1.id,
        sender_id: maria,
        body: "It's the wardrobe assembly booking from this morning.",
      },
      { ticket_id: t1.id, sender_id: maria, body: "Update: still pending as of now, thanks." },
    ]);
    await admin
      .from("support_tickets")
      .insert({
        user_id: maria,
        subject: "How do I edit a posted task?",
        narrative:
          "I'd like to change the schedule on an open task — is that possible after posting?",
        category: "task",
        status: "RESOLVED",
      });
    log("support_tickets ✓ (2) + ticket_messages ✓");
  } else log("support_tickets already present");

  // --- F. Reports ---
  console.log("F. Reports");
  const { count: rpCount } = await admin
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("reporter_id", maria);
  if ((rpCount ?? 0) === 0) {
    await admin
      .from("reports")
      .insert({
        reporter_id: maria,
        resource_type: "user",
        resource_id: ramon,
        category: "other",
        narrative:
          "Flagging for follow-up: please confirm this tasker's verification badge is current.",
      });
    log("reports ✓ (1)");
  } else log("reports already present");

  // --- G. Task media on the open task ---
  console.log("G. Task media");
  if (openTask) {
    const { count: mCount } = await admin
      .from("task_media")
      .select("*", { count: "exact", head: true })
      .eq("task_id", openTask.id);
    if ((mCount ?? 0) === 0) {
      await admin.from("task_media").insert([
        {
          task_id: openTask.id,
          storage_path: `${maria}/${openTask.id}/photo1.jpg`,
          kind: "image",
          sort_order: 0,
        },
        {
          task_id: openTask.id,
          storage_path: `${maria}/${openTask.id}/photo2.jpg`,
          kind: "image",
          sort_order: 1,
        },
      ]);
      log("task_media ✓ (2)");
    } else log("task_media already present");
  }

  console.log(`\nDone. New lifecycle bookings created: ${created}.`);
}

async function seedReview(bookingId, reviewerId, revieweeId, score, comment, dims) {
  const { data: ex } = await admin
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle();
  if (ex) return;
  const { data: rv, error } = await admin
    .from("reviews")
    .insert({
      booking_id: bookingId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      score,
      comment,
      status: "REVEALED",
      revealed_at: daysAgo(1),
    })
    .select("id")
    .single();
  if (error) throw new Error(`review insert: ${error.message}`);
  await admin
    .from("review_dimensions")
    .insert(dims.map((d) => ({ review_id: rv.id, dimension: d.dimension, score: d.score })));
}

main().catch((e) => {
  console.error(`\nSeed failed: ${e.message}`);
  process.exit(1);
});

