#!/usr/bin/env node
/**
 * Seed OWNED tasks for the Tasker dev account (tasker@dev.dizkarte.invalid /
 * Ramon Bautista) so his client-side "My Tasks" page (/my-tasks) is populated
 * across every filter:
 *   Draft · Published (OPEN) · Assigned (ASSIGNED/IN_PROGRESS/COMPLETION_REQUESTED)
 *   · Completed · Closed (DISPUTED)
 * with realistic offer and question counts.
 *
 * Ramon holds the CLIENT capability too, so he can post tasks. Maria
 * (client@dev.dizkarte.invalid) is used as the counterparty tasker on his
 * booked tasks — the only other mobile account — mirroring
 * scripts/seed-client-testdata.mjs with the roles reversed.
 *
 * Idempotent: tasks are keyed by (client_id, title) and bookings by
 * idempotency_key, so re-running creates nothing new. Direct service-role
 * inserts, same approach as scripts/seed-supabase.mjs and seed-client-testdata.mjs.
 *
 * Usage: node scripts/seed-tasker-testdata.mjs
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
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (populate .env.seed).");
  process.exit(1);
}
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const QC = { city: "137404", brgy: "137404022" }; // Quezon City / Commonwealth (Ramon's area)
const POINT = "SRID=4326;POINT(121.0451 14.6890)";
const ADDRESS = "18 Ipil Street, Commonwealth, Quezon City (seed)";
const LANDMARK = "Near Commonwealth Market";
const now = Date.now();
const daysAgo = (n) => new Date(now - Math.max(0, n) * 86400000).toISOString();
let created = 0;
const log = (m) => console.log("  " + m);

async function userId(email) {
  const { data: u, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return u.users.find((x) => x.email === email)?.id ?? null;
}

async function main() {
  const ramon = await userId("tasker@dev.dizkarte.invalid");
  const maria = await userId("client@dev.dizkarte.invalid");
  if (!ramon || !maria) throw new Error("dev accounts not found — run `npm run seed:supabase` first");
  console.log(
    `Seeding My Tasks for Ramon (${ramon.slice(0, 8)}); counterparty tasker Maria (${maria.slice(0, 8)})\n`,
  );

  const { data: cats } = await admin.from("categories").select("id,slug").eq("active", true);
  if (!cats || cats.length === 0) throw new Error("no active categories found");
  const cat = (slug) => cats.find((c) => c.slug === slug)?.id ?? cats[0].id;

  // Insert a task owned by Ramon plus its public/private location, unless a task
  // with the same title already exists for him. Returns { id, existed }.
  async function ensureTask(t) {
    const { data: existing } = await admin
      .from("tasks")
      .select("id")
      .eq("client_id", ramon)
      .eq("title", t.title)
      .maybeSingle();
    if (existing) return { id: existing.id, existed: true };
    const { data: task, error } = await admin
      .from("tasks")
      .insert({
        client_id: ramon,
        category_id: cat(t.categorySlug),
        title: t.title,
        description: t.description,
        budget_centavos: t.budget,
        scheduled_for: t.scheduledFor ?? null,
        same_day: t.sameDay ?? false,
        status: t.status,
        published_at: t.status === "DRAFT" ? null : daysAgo(t.ageDays + 1),
        created_at: daysAgo(t.ageDays + 2),
        updated_at: daysAgo(t.ageDays),
      })
      .select("id")
      .single();
    if (error) throw new Error(`task insert (${t.title}): ${error.message}`);
    await admin.from("task_public_locations").insert({
      task_id: task.id,
      city_code: QC.city,
      barangay_code: QC.brgy,
      landmark: LANDMARK,
      approximate_point: POINT,
    });
    await admin.from("task_private_locations").insert({
      task_id: task.id,
      exact_address: ADDRESS,
      exact_point: POINT,
    });
    return { id: task.id, existed: false };
  }

  async function addQuestions(taskId, questions) {
    const { count } = await admin
      .from("task_questions")
      .select("*", { count: "exact", head: true })
      .eq("task_id", taskId);
    if ((count ?? 0) > 0) return;
    await admin.from("task_questions").insert(
      questions.map((q) => ({
        task_id: taskId,
        author_id: maria,
        body: q.body,
        status: "APPROVED",
        ...(q.answer ? { answer: q.answer, answered_at: daysAgo(1) } : {}),
      })),
    );
  }

  // --- A. Draft ---
  console.log("A. Draft");
  const draft = await ensureTask({
    title: "Mount a 55-inch TV on the living room wall",
    description:
      "Wall-mount a 55-inch TV on a concrete wall, conceal the cables, and set the bracket level. Draft — still finalising the schedule before publishing.",
    categorySlug: "repairs-installations",
    budget: 150000,
    status: "DRAFT",
    ageDays: 1,
  });
  log(draft.existed ? "draft already exists" : "draft ✓");
  if (!draft.existed) created++;

  // --- B. Published (open for offers) ---
  console.log("B. Published (open)");
  const openWithOffer = await ensureTask({
    title: "Deep clean a 2-bedroom condo unit",
    description:
      "Move-out deep clean for a 2-bedroom condo: kitchen, two bathrooms, floors, and interior windows. Supplies can be provided.",
    categorySlug: "cleaning",
    budget: 250000,
    status: "OPEN",
    scheduledFor: daysAgo(-3),
    ageDays: 3,
  });
  if (!openWithOffer.existed) {
    created++;
    await addQuestions(openWithOffer.id, [
      {
        body: "Are cleaning supplies and equipment provided, or should I bring my own?",
        answer: "Please bring your own — I'll reimburse consumables.",
      },
      { body: "Is there parking for service providers in the building?" },
    ]);
    // One SUBMITTED offer so the card shows "Review 1 offer".
    const { data: existingOffer } = await admin
      .from("offers")
      .select("id")
      .eq("task_id", openWithOffer.id)
      .eq("tasker_id", maria)
      .maybeSingle();
    if (!existingOffer) {
      await admin.from("offers").insert({
        task_id: openWithOffer.id,
        tasker_id: maria,
        amount_centavos: 240000,
        message: "I can do a thorough move-out clean and finish within the day.",
        eta_text: "This weekend",
        availability_text: "Saturday or Sunday morning",
        experience_text: "Regular condo deep-cleans across Metro Manila.",
        status: "SUBMITTED",
        created_at: daysAgo(2),
      });
    }
    log("open (with 1 offer + 2 questions) ✓");
  } else log("open (with offer) already exists");

  const openWaiting = await ensureTask({
    title: "Assemble three flat-pack bookshelves",
    description:
      "Assemble three flat-pack bookshelves and anchor them to the wall for safety. All parts and hardware are on site.",
    categorySlug: "furniture-assembly",
    budget: 180000,
    status: "OPEN",
    sameDay: true,
    ageDays: 2,
  });
  if (!openWaiting.existed) {
    created++;
    await addQuestions(openWaiting.id, [
      { body: "Roughly how tall are the units, and are wall anchors included?" },
    ]);
    log("open (waiting for offers) ✓");
  } else log("open (waiting) already exists");

  // --- C. Lifecycle tasks (Assigned / Completed / Closed) ---
  console.log("C. Booked lifecycle (Maria is the counterparty tasker)");
  const lifecycle = [
    {
      key: "seed-ramon-confirmed",
      title: "Aircon cleaning for two split-type units",
      categorySlug: "repairs-installations",
      budget: 160000,
      taskStatus: "ASSIGNED",
      bookingStatus: "CONFIRMED",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 5,
    },
    {
      key: "seed-ramon-inprogress",
      title: "Repaint the master bedroom",
      categorySlug: "painting",
      budget: 320000,
      taskStatus: "IN_PROGRESS",
      bookingStatus: "IN_PROGRESS",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 7,
    },
    {
      key: "seed-ramon-completionreq",
      title: "Repair a dripping bathroom faucet",
      categorySlug: "repairs-installations",
      budget: 95000,
      taskStatus: "COMPLETION_REQUESTED",
      bookingStatus: "COMPLETION_REQUESTED",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 9,
    },
    {
      key: "seed-ramon-completed",
      title: "Install floating shelves in the home office",
      categorySlug: "furniture-assembly",
      budget: 140000,
      taskStatus: "COMPLETED",
      bookingStatus: "COMPLETED",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 14,
      review: true,
    },
    {
      key: "seed-ramon-disputed",
      title: "Backyard landscaping and haul-away",
      categorySlug: "gardening",
      budget: 480000,
      taskStatus: "DISPUTED",
      bookingStatus: "DISPUTED",
      intent: "CONFIRMED",
      chat: true,
      ageDays: 18,
      dispute: true,
    },
  ];

  for (const b of lifecycle) {
    const { data: existingBooking } = await admin
      .from("bookings")
      .select("id")
      .eq("idempotency_key", b.key)
      .maybeSingle();
    if (existingBooking) {
      log(`${b.bookingStatus} already exists`);
      continue;
    }
    const task = await ensureTask({
      title: b.title,
      description: `${b.title}. Seeded ${b.bookingStatus} booking so Ramon's My Tasks shows this stage.`,
      categorySlug: b.categorySlug,
      budget: b.budget,
      status: b.taskStatus,
      ageDays: b.ageDays,
    });
    const { data: offer } = await admin
      .from("offers")
      .insert({
        task_id: task.id,
        tasker_id: maria,
        amount_centavos: b.budget,
        message: "Happy to take this on — I'll bring the tools and materials needed.",
        eta_text: "Available this week",
        availability_text: "Weekdays and weekends",
        experience_text: "Plenty of experience with jobs like this.",
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
        client_id: ramon,
        tasker_id: maria,
        agreed_centavos: b.budget,
        status: b.bookingStatus,
        idempotency_key: b.key,
        created_at: daysAgo(b.ageDays - 1),
      })
      .select("id")
      .single();
    await admin.from("payment_intents").insert({
      booking_id: booking.id,
      provider: "xendit",
      amount_centavos: b.budget,
      status: b.intent,
      idempotency_key: `pi_${b.key}`,
    });

    // Booking event timeline up to the current state.
    const evts = [{ from: null, to: "PAYMENT_PENDING" }];
    if (b.bookingStatus !== "PAYMENT_PENDING") evts.push({ from: "PAYMENT_PENDING", to: "CONFIRMED" });
    if (["IN_PROGRESS", "COMPLETION_REQUESTED", "COMPLETED", "DISPUTED"].includes(b.bookingStatus))
      evts.push({ from: "CONFIRMED", to: "IN_PROGRESS" });
    if (["COMPLETION_REQUESTED", "COMPLETED"].includes(b.bookingStatus))
      evts.push({ from: "IN_PROGRESS", to: "COMPLETION_REQUESTED" });
    if (b.bookingStatus === "COMPLETED")
      evts.push({ from: "COMPLETION_REQUESTED", to: "COMPLETED" });
    if (b.bookingStatus === "DISPUTED") evts.push({ from: "IN_PROGRESS", to: "DISPUTED" });
    await admin.from("booking_events").insert(
      evts.map((e, i) => ({
        booking_id: booking.id,
        from_status: e.from,
        to_status: e.to,
        actor_id: ramon,
        source: "client",
        idempotency_key: `${b.key}-evt-${i}`,
      })),
    );

    if (b.chat) {
      const { data: convo } = await admin
        .from("conversations")
        .insert({ booking_id: booking.id, created_at: daysAgo(b.ageDays - 1) })
        .select("id")
        .single();
      await admin.from("conversation_participants").insert([
        { conversation_id: convo.id, user_id: ramon },
        { conversation_id: convo.id, user_id: maria },
      ]);
      await admin.from("messages").insert([
        {
          conversation_id: convo.id,
          sender_id: ramon,
          body: "Hi! Thanks for taking this on — let me know if you need any details.",
          created_at: daysAgo(b.ageDays - 1),
        },
        {
          conversation_id: convo.id,
          sender_id: maria,
          body: "Will do — I'll arrive on schedule with everything needed.",
          created_at: daysAgo(b.ageDays - 1),
        },
      ]);
    }

    if (b.dispute) {
      const { data: dsp } = await admin
        .from("disputes")
        .insert({
          booking_id: booking.id,
          opened_by: ramon,
          status: "OPEN",
          reason: "Part of the yard was left uncleared and the haul-away was not completed as agreed.",
        })
        .select("id")
        .single();
      await admin.from("evidence").insert({
        owner_id: ramon,
        resource_type: "dispute",
        resource_id: dsp.id,
        storage_path: `${ramon}/disputes/${dsp.id}/photo1.jpg`,
      });
    }

    if (b.review) {
      await seedReview(booking.id, ramon, maria, 5, "Excellent work — clean, careful, and right on schedule. Highly recommended!", [
        { dimension: "communication", score: 5 },
        { dimension: "quality", score: 5 },
        { dimension: "timeliness", score: 5 },
        { dimension: "professionalism", score: 5 },
      ]);
      await seedReview(booking.id, maria, ramon, 5, "Clear brief and easy to coordinate with — thank you!", [
        { dimension: "communication", score: 5 },
        { dimension: "professionalism", score: 5 },
      ]);
    }

    created++;
    log(`${b.bookingStatus} ✓`);
  }

  // --- Summary (verification) ---
  const { data: allTasks } = await admin.from("tasks").select("status").eq("client_id", ramon);
  const byStatus = {};
  for (const t of allTasks ?? []) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  console.log(`\nDone. New rows created this run: ${created}.`);
  console.log(`Ramon now owns ${(allTasks ?? []).length} task(s): ${JSON.stringify(byStatus)}`);
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
